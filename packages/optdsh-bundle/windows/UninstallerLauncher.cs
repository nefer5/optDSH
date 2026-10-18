using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;

internal static class UninstallerLauncher {
    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    [STAThread]
    private static int Main() {
        try {
            string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string source = Path.Combine(root, "packaging", "windows");
            string temp = Path.Combine(Path.GetTempPath(), "optdsh-uninstall-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(temp);
            foreach (string name in new[] { "uninstall.ps1", "recycle.ps1", "install-profile-component.ps1" }) File.Copy(Path.Combine(source, name), Path.Combine(temp, name));
            string bundle = Path.Combine(root, "node_modules", "optdsh-bundle");
            Directory.CreateDirectory(Path.Combine(temp, "lib"));
            Directory.CreateDirectory(Path.Combine(temp, "uninstaller-web"));
            File.Copy(Path.Combine(bundle, "lib", "uninstaller-server.mjs"), Path.Combine(temp, "lib", "uninstaller-server.mjs"));
            foreach (string file in Directory.GetFiles(Path.Combine(bundle, "uninstaller-web"))) File.Copy(file, Path.Combine(temp, "uninstaller-web", Path.GetFileName(file)));
            string node = "node.exe";
            var match = Regex.Match(File.ReadAllText(Path.Combine(root, "optdsh-launcher.json")), @"""nodeExecutable""\s*:\s*""([^""]+)""");
            if (match.Success && File.Exists(match.Groups[1].Value.Replace("\\\\", "\\"))) node = match.Groups[1].Value.Replace("\\\\", "\\");
            try {
                var browser = new ProcessStartInfo(node, Quote(Path.Combine(temp, "lib", "uninstaller-server.mjs")) + " " + Quote(root) + " " + Quote(temp));
                browser.UseShellExecute = false; browser.CreateNoWindow = true; browser.WorkingDirectory = temp;
                Process.Start(browser);
                return 0;
            } catch (System.ComponentModel.Win32Exception) { /* Node removed: retain a native program-only fallback. */ }
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
            string args = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " + Quote(Path.Combine(temp, "uninstall.ps1")) + " -InstallRoot " + Quote(root) + " -Apply -ConfirmUi -StopRunning -WaitForProcessId " + Process.GetCurrentProcess().Id;
            var start = new ProcessStartInfo(powershell, args);
            start.UseShellExecute = false; start.CreateNoWindow = true; start.WorkingDirectory = temp;
            Process.Start(start);
            return 0;
        } catch (Exception error) {
            MessageBox.Show(error.Message, "optDSH Uninstall", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1;
        }
    }
}
