using System;
using System.IO;
using System.Diagnostics;
using System.Text;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

[DataContract]
internal class LauncherSettings {
    [DataMember(Name="nodeExecutable")] public string NodeExecutable { get; set; }
}
internal static class Launcher {
    // Quote each argv item using the Windows C-runtime escaping rules.
    static string Quote(string value) {
        var text = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { text.Append('\\', slashes * 2 + 1); text.Append(c); slashes = 0; continue; }
            text.Append('\\', slashes); slashes = 0; text.Append(c);
        }
        text.Append('\\', slashes * 2); return text.Append('"').ToString();
    }
    static int Main(string[] args) {
        bool noPause = Array.IndexOf(args,"--no-pause") >= 0;
        int exitCode = 1;
        try {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string config = Path.Combine(root,"optdsh-launcher.json");
            for (int i=0;i<args.Length;i++) if (args[i]=="--config" && i+1<args.Length) config=Path.GetFullPath(args[i+1]);
            string node = null;
            if (File.Exists(config)) using(var stream = new MemoryStream(Encoding.UTF8.GetBytes(File.ReadAllText(config, Encoding.UTF8)))) {
                var settings=(LauncherSettings)new DataContractJsonSerializer(typeof(LauncherSettings)).ReadObject(stream);
                if(settings!=null && !String.IsNullOrWhiteSpace(settings.NodeExecutable)) {
                    node=Path.IsPathRooted(settings.NodeExecutable)?settings.NodeExecutable:Path.Combine(Path.GetDirectoryName(config),settings.NodeExecutable);
                    if(!File.Exists(node))throw new Exception("Configured Node.js executable does not exist.");
                }
            }
            if(node==null) foreach(string item in (Environment.GetEnvironmentVariable("PATH")??"").Split(';')) {
                if(String.IsNullOrWhiteSpace(item))continue;
                string candidate=Path.Combine(item.Trim('"'),"node.exe");
                if(File.Exists(candidate)){node=candidate;break;}
            }
            if(node==null)throw new Exception("Node.js 24.x is required. Install it, or set nodeExecutable in optdsh-launcher.json.");
            string script=Path.Combine(root,"node_modules","optdsh-bundle","lib","launcher.mjs");
            if(!File.Exists(script))throw new Exception("The installed optDSH launcher module is missing.");
            var command=new StringBuilder(Quote(script));
            command.Append(" --config ").Append(Quote(config));
            foreach(string arg in args)command.Append(' ').Append(Quote(arg));
            var info=new ProcessStartInfo(node,command.ToString());
            info.UseShellExecute=false; info.WorkingDirectory=Environment.CurrentDirectory;
            using(var child=Process.Start(info)){child.WaitForExit();if(child.ExitCode==0)return 0;exitCode=child.ExitCode;}
        }catch(Exception error){Console.Error.WriteLine("optDSH: "+error.Message);}
        if(!noPause && !Console.IsInputRedirected){Console.Error.WriteLine("Press any key to close.");Console.ReadKey(true);}
        return exitCode;
    }
}
