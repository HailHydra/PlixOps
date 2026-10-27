import { NextResponse } from "next/server";
import { sendGmailNotification, getEmailDispatchLogs } from "@/lib/notifications/email";

export async function POST(request) {
  try {
    const body = await request.json();
    const { to, recipientName, action, task, actorName, customNote, dashboardUrl } = body;

    if (!to) {
      return NextResponse.json({ error: "Missing recipient email address ('to')" }, { status: 400 });
    }

    const result = await sendGmailNotification({
      to,
      recipientName,
      action,
      task,
      actorName,
      customNote,
      dashboardUrl,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const logs = getEmailDispatchLogs();
  return NextResponse.json({ logs });
}

