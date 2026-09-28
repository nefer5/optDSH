"""Deterministic angular-grid analysis, extracted from N02; no plotting side effects."""
import math
from typing import Any
import numpy as np
ANGLE_DEFINITION_URL='https://ansyshelp.ansys.com/public/Views/Secured/Zemax/v252/en/OpticStudio_User_Guide/OpticStudio_Help/topics/Detector_Rectangle_Object.html'

def _weighted_quantile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    valid = np.isfinite(values) & np.isfinite(weights) & (weights > 0.0)
    if not np.any(valid):
        raise ValueError("No positive finite weights are available for an AOI quantile.")
    order = np.argsort(values[valid])
    sorted_values = values[valid][order]
    sorted_weights = weights[valid][order]
    target = q * float(np.sum(sorted_weights))
    index = min(int(np.searchsorted(np.cumsum(sorted_weights), target)), len(order) - 1)
    return float(sorted_values[index])


def _radial_projection_grid(
    x_centers_deg: np.ndarray,
    y_centers_deg: np.ndarray,
    dx_rad: float,
    dy_rad: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Return AOI and pixel solid angle for OpticStudio direction-angle bins."""

    xx, yy = np.meshgrid(np.deg2rad(x_centers_deg), np.deg2rad(y_centers_deg))
    theta = np.hypot(xx, yy)
    valid = theta <= (0.5 * math.pi)
    jacobian = np.ones_like(theta)
    nonzero = theta > 0.0
    jacobian[nonzero] = np.sin(theta[nonzero]) / theta[nonzero]
    solid_angle = np.zeros_like(theta)
    solid_angle[valid] = jacobian[valid] * dx_rad * dy_rad
    aoi = np.full_like(theta, np.nan)
    aoi[valid] = np.rad2deg(theta[valid])
    return aoi, solid_angle


def _tangent_hypothesis(
    x_edges_deg: np.ndarray,
    y_edges_deg: np.ndarray,
    xx_deg: np.ndarray,
    yy_deg: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    x = np.tan(np.deg2rad(x_edges_deg))
    y = np.tan(np.deg2rad(y_edges_deg))
    x1, x2 = x[:-1][None, :], x[1:][None, :]
    y1, y2 = y[:-1][:, None], y[1:][:, None]

    def primitive(u: np.ndarray, v: np.ndarray) -> np.ndarray:
        return np.arctan2(u * v, np.sqrt(1.0 + u * u + v * v))

    solid_angle = np.abs(
        primitive(x2, y2)
        - primitive(x1, y2)
        - primitive(x2, y1)
        + primitive(x1, y1)
    )
    aoi = np.rad2deg(
        np.arctan(
            np.sqrt(
                np.tan(np.deg2rad(xx_deg)) ** 2
                + np.tan(np.deg2rad(yy_deg)) ** 2
            )
        )
    )
    return aoi, solid_angle


def _direction_cosine_hypothesis(
    x_centers_deg: np.ndarray,
    y_centers_deg: np.ndarray,
    dx_rad: float,
    dy_rad: float,
) -> tuple[np.ndarray, np.ndarray]:
    xx, yy = np.meshgrid(np.deg2rad(x_centers_deg), np.deg2rad(y_centers_deg))
    sin_x = np.sin(xx)
    sin_y = np.sin(yy)
    radial_sq = sin_x * sin_x + sin_y * sin_y
    valid = radial_sq < 1.0
    solid_angle = np.zeros_like(radial_sq)
    solid_angle[valid] = (
        np.cos(xx[valid])
        * np.cos(yy[valid])
        / np.sqrt(1.0 - radial_sq[valid])
        * dx_rad
        * dy_rad
    )
    aoi = np.full_like(radial_sq, np.nan)
    aoi[valid] = np.rad2deg(np.arcsin(np.sqrt(radial_sq[valid])))
    return aoi, solid_angle


def analyze_angle_grid(
    intensity_w_per_sr: np.ndarray,
    detector: dict[str, Any],
    api_total_flux: float,
    *,
    histogram_bin_width_deg: float = 0.5,
    integration_tolerance: float = 0.005,
) -> tuple[dict[str, Any], np.ndarray, np.ndarray, list[dict[str, float]]]:
    """Convert Detector Rectangle angle intensity into a power-weighted AOI PDF."""

    intensity = np.asarray(intensity_w_per_sr, dtype=np.float64)
    nx, ny = int(detector["x_pixels"]), int(detector["y_pixels"])
    if intensity.shape != (ny, nx):
        raise ValueError(f"Expected angle grid {(ny, nx)}, got {intensity.shape}.")
    if not math.isfinite(api_total_flux) or api_total_flux <= 0.0:
        raise ValueError(f"API total angle flux must be positive, got {api_total_flux!r}.")
    if histogram_bin_width_deg <= 0.0:
        raise ValueError("Histogram bin width must be positive.")

    x_edges = np.linspace(detector["x_angle_min_deg"], detector["x_angle_max_deg"], nx + 1)
    y_edges = np.linspace(detector["y_angle_min_deg"], detector["y_angle_max_deg"], ny + 1)
    x_centers = 0.5 * (x_edges[:-1] + x_edges[1:])
    y_centers = 0.5 * (y_edges[:-1] + y_edges[1:])
    xx_deg, yy_deg = np.meshgrid(x_centers, y_centers)
    dx_rad = math.radians(float(x_edges[1] - x_edges[0]))
    dy_rad = math.radians(float(y_edges[1] - y_edges[0]))

    aoi, solid_angle = _radial_projection_grid(x_centers, y_centers, dx_rad, dy_rad)
    unscaled_power = intensity * solid_angle
    valid = np.isfinite(aoi) & np.isfinite(unscaled_power) & (unscaled_power > 0.0)
    if not np.any(valid):
        raise ValueError("Angle-space grid contains no positive finite power.")
    recovered_total = float(np.sum(unscaled_power[valid]))
    relative_error = abs(recovered_total - api_total_flux) / api_total_flux
    scale = api_total_flux / recovered_total
    power = np.where(valid, unscaled_power * scale, 0.0)
    values, weights = aoi[valid], power[valid]
    mean = float(np.average(values, weights=weights))
    std = float(np.sqrt(np.average((values - mean) ** 2, weights=weights)))

    tangent_aoi, tangent_omega = _tangent_hypothesis(
        x_edges, y_edges, xx_deg, yy_deg
    )
    dircos_aoi, dircos_omega = _direction_cosine_hypothesis(
        x_centers, y_centers, dx_rad, dy_rad
    )
    hypotheses = {
        "projected_tangent_angles": intensity * tangent_omega,
        "direction_cosine_angles": intensity * dircos_omega,
        "raw_pixel_values": intensity,
    }
    diagnostics: dict[str, dict[str, float]] = {}
    for name, candidate in hypotheses.items():
        candidate_total = float(np.nansum(candidate))
        diagnostics[name] = {
            "recovered_total": candidate_total,
            "api_total": api_total_flux,
            "relative_error": abs(candidate_total - api_total_flux) / api_total_flux,
        }

    stats = {
        "angle_convention": "radial_projection_angles",
        "angle_definition_url": ANGLE_DEFINITION_URL,
        "integration_validation": {
            "recovered_total": recovered_total,
            "api_total": api_total_flux,
            "relative_error": relative_error,
            "tolerance": integration_tolerance,
            "passed": relative_error <= integration_tolerance,
        },
        "alternative_hypothesis_diagnostics": diagnostics,
        "total_angle_flux_model_units": api_total_flux,
        "nonzero_angle_pixels": int(np.count_nonzero(valid)),
        "power_weighted_aoi_deg": {
            "min": float(np.min(values)),
            "p01": _weighted_quantile(values, weights, 0.01),
            "p05": _weighted_quantile(values, weights, 0.05),
            "p10": _weighted_quantile(values, weights, 0.10),
            "mean": mean,
            "std": std,
            "p50": _weighted_quantile(values, weights, 0.50),
            "p90": _weighted_quantile(values, weights, 0.90),
            "p95": _weighted_quantile(values, weights, 0.95),
            "p99": _weighted_quantile(values, weights, 0.99),
            "max": float(np.max(values)),
        },
    }

    edges = np.arange(0.0, 90.0 + histogram_bin_width_deg, histogram_bin_width_deg)
    histogram_power, edges = np.histogram(values, bins=edges, weights=weights)
    fractions = histogram_power / float(np.sum(histogram_power))
    cumulative = np.cumsum(fractions)
    histogram = [
        {
            "aoi_low_deg": float(edges[index]),
            "aoi_high_deg": float(edges[index + 1]),
            "aoi_center_deg": float(0.5 * (edges[index] + edges[index + 1])),
            "power_model_units": float(value),
            "power_fraction": float(fractions[index]),
            "cumulative_fraction": float(cumulative[index]),
        }
        for index, value in enumerate(histogram_power)
    ]
    return stats, aoi, power, histogram
