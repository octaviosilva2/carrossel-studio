// Handler do Auth.js (rotas GET/POST /api/auth/*). Runtime Node — bcrypt (usado no
// authorize) nao roda em Edge.

import { handlers } from "@/auth";

export const runtime = "nodejs";
export const { GET, POST } = handlers;
