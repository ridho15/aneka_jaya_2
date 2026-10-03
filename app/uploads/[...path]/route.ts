import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf"
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: subpaths } = await context.params;
    if (!subpaths || subpaths.length === 0) {
      return NextResponse.json({ message: "File not specified" }, { status: 400 });
    }

    const baseDir = path.resolve(process.cwd(), "public", "uploads");
    const targetPath = path.resolve(baseDir, ...subpaths);

    // Guard against path traversal attacks (e.g., ../../etc/passwd)
    if (!targetPath.startsWith(baseDir)) {
      return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }

    const fileStat = await stat(targetPath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return NextResponse.json({ message: "File not found" }, { status: 404 });
    }

    const buffer = await readFile(targetPath);
    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error reading file";
    return NextResponse.json({ message }, { status: 500 });
  }
}
