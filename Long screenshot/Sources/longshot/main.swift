import Foundation
import LongScreenshotCore

@main
struct LongshotCLI {
    static func main() async {
        let args = CommandLine.arguments
        guard (args.count == 6 || args.count == 8), args[2] == "--output", args[4] == "--report",
              args.count == 6 || (args[6] == "--max-width" && Int(args[7]).map({ $0 >= 0 }) == true) else {
            fputs("Usage: longshot input.mov --output output.png --report report.json [--max-width pixels]\n", stderr)
            exit(2)
        }
        let input = URL(fileURLWithPath: args[1])
        let output = URL(fileURLWithPath: args[3])
        let reportURL = URL(fileURLWithPath: args[5])
        var report = StitchReport()
        do {
            try await VideoStitcher(maxWidth: args.count == 8 ? Int(args[7])! : 720)
                .stitch(input: input, output: output, report: &report)
        } catch {
            report.status = "failed"
            report.reason = String(describing: error)
        }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(report).write(to: reportURL, options: .atomic)
        } catch {
            fputs("Report write failed: \(error)\n", stderr)
            exit(3)
        }
        if report.status == "success" {
            print("Wrote \(output.path) (\(report.outputWidth ?? 0) × \(report.outputHeight ?? 0))")
        } else {
            fputs("Stitch failed: \(report.reason ?? "unknown")\n", stderr)
            exit(1)
        }
    }
}
