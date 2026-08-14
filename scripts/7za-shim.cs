using System;
using System.Diagnostics;
using System.IO;
using System.Linq;

// 7za 替身：解决 winCodeSign 压缩包内 darwin 符号链接在无管理员权限下无法解压的问题。
// 逻辑：解压前若压缩包路径含 winCodeSign，先用真实 7za 删除 darwin 目录（该目录仅供 macOS 签名使用），
// 再去掉 -snld 参数执行原解压命令，退出码原样透传。其余调用完全透传。
class Program
{
    static int Main(string[] args)
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string real = Path.Combine(dir, "7za-real.exe");

        var list = args.ToList();
        list.RemoveAll(a => a == "-snld");

        int xi = list.FindIndex(a => a == "x" || a == "e" || a == "t");
        string archive = null;
        if (xi >= 0)
        {
            for (int i = xi + 1; i < list.Count; i++)
            {
                string a = list[i];
                if (a.Length > 0 && !a.StartsWith("-"))
                {
                    archive = a;
                    break;
                }
            }
        }

        if (archive != null && archive.IndexOf("winCodeSign", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            var del = Process.Start(new ProcessStartInfo(real, "d \"" + archive + "\" darwin")
            {
                UseShellExecute = false,
                CreateNoWindow = true
            });
            del.WaitForExit();
        }

        string cmd = string.Join(" ", list.Select(a => a.IndexOf(' ') >= 0 ? "\"" + a + "\"" : a));
        var p = Process.Start(new ProcessStartInfo(real, cmd)
        {
            UseShellExecute = false,
            CreateNoWindow = true
        });
        p.WaitForExit();
        return p.ExitCode;
    }
}
