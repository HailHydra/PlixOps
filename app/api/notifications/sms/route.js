import { NextResponse } from "next/server";
import { sendSmsNotification, getSmsDispatchLogs } from "@/lib/notifications/sms";

export async function POST(request) {
  try {
    const body = await request.json();
    const { phone, recipientName, action, task, actorName } = body;

    if (!phone) {
      return NextResponse.json({ error: "Missing phone number" }, { status: 400 });
    }

    const result = await sendSmsNotification({
      phone,
      recipientName,
      action,
      task,
      actorName,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const logs = getSmsDispatchLogs();
  return NextResponse.json({ logs });
}
