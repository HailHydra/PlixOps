import { getState } from "@/lib/store/unified-store";
import { readReviewVideo } from "@/lib/video/storage";

export const runtime = "nodejs";

export async function GET(request, context) {
  try {
    const { id, key } = await context.params;
    const { tasks } = await getState();
    const task = tasks.find((item) => item.id === id);
    if (!task) return new Response(null, { status: 404 });

    const asset = [task.videoAsset, ...(task.versions || []).map((item) => item.videoAsset)].find(
      (item) => item?.key === key
    );
    if (!asset) return new Response(null, { status: 404 });

    const { bytes } = await readReviewVideo(asset);
    const headers = {
      "Content-Type": asset.type || "video/mp4",
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    };

    const range = request.headers.get("range");
    if (!range) {
      return new Response(bytes, {
        headers: { ...headers, "Content-Length": String(bytes.length) },
      });
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    }

    const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;

    if (start > end || start >= bytes.length) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    }

    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Content-Length": String(end - start + 1),
      },
    });
  } catch (err) {
    return new Response(null, { status: 404 });
  }
}

