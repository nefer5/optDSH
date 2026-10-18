using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class InstallerLauncher {
    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    [STAThread]
    private static int Main() {
        try {
            string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string support = Path.Combine(root, "_support");
            if (File.Exists(Path.Combine(support, "release-manifest.json"))) root = support;
            string script = Path.Combine(root, "packaging", "windows", "install-gui.ps1");
            if (!File.Exists(script)) throw new InvalidOperationException("Please extract the complete optDSH package before starting setup.");
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
            var start = new ProcessStartInfo(powershell, "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " + Quote(script) + " -ReleaseRoot " + Quote(root));
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            Process.Start(start);
            return 0;
        } catch (Exception error) {
            MessageBox.Show(error.Message, "optDSH Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
