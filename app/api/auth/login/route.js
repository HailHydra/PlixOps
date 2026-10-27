import { NextResponse } from "next/server";
import { findUserByEmail, findUserById, TEAM_USERS } from "@/lib/auth/users";
import { serializeSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, userId, role } = body;

    let user = null;
    if (email) {
      user = findUserByEmail(email);
    } else if (userId) {
      user = findUserById(userId);
    } else if (role) {
      user = TEAM_USERS.find((u) => u.role === role);
    }

    if (!user) {
      return NextResponse.json(
        { error: "No team member found matching this email or role" },
        { status: 401 }
      );
    }

    const token = serializeSession(user);
    const response = NextResponse.json({ success: true, user });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message || "Login failed" }, { status: 500 });
  }
}

