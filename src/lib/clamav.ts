import { createHash } from "node:crypto";
import { connect } from "node:net";

export type ScanResult = "OK" | "INFECTED" | "SKIPPED";

/**
 * Stream a file to the local ClamAV daemon (INSTREAM) and report the verdict.
 * The compose stack runs clamav on the internal network; when it is absent
 * (dev/tests) the scan is SKIPPED rather than blocking the upload.
 */
export function scanWithClamav(bytes: Uint8Array, host = process.env.CLAMAV_HOST || "clamav", port = 3310): Promise<ScanResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: ScanResult) => { if (!settled) { settled = true; resolve(r); } };

    const socket = connect(port, host);
    socket.on("error", () => done("SKIPPED"));
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      socket.write(Buffer.from(bytes));
      socket.write(Buffer.from([0, 0, 0, 0])); // chunked terminator
      socket.end();
    });

    let response = "";
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.on("close", () => {
      if (response.includes("FOUND")) done("INFECTED");
      else if (response.includes("OK")) done("OK");
      else done("SKIPPED");
    });
    socket.on("timeout", () => { socket.destroy(); done("SKIPPED"); });
    socket.setTimeout(10000);
  });
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
