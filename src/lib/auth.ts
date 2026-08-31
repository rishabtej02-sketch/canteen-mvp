"use client";

// Lightweight demo auth using localStorage.
// Two roles: student (bound to a real profiles.id) and operator.
// Swap for Supabase Auth when ready (see README).

import type { Profile } from "@/types/db";

const LS_STUDENT = "canteen.session.student";
const LS_OPERATOR = "canteen.session.operator";

export type StudentSession = {
  id: string;
  email: string;
  full_name: string | null;
};
export type OperatorSession = {
  label: string;
  loggedInAt: string;
};

// Default operator password. For real deploys, set NEXT_PUBLIC_OPERATOR_PASSWORD.
export const OPERATOR_PASSWORD =
  process.env.NEXT_PUBLIC_OPERATOR_PASSWORD || "canteen-op";

export const getStudent = (): StudentSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_STUDENT);
    return raw ? (JSON.parse(raw) as StudentSession) : null;
  } catch {
    return null;
  }
};

export const setStudent = (s: StudentSession) => {
  localStorage.setItem(LS_STUDENT, JSON.stringify(s));
};

export const clearStudent = () => localStorage.removeItem(LS_STUDENT);

export const getOperator = (): OperatorSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_OPERATOR);
    return raw ? (JSON.parse(raw) as OperatorSession) : null;
  } catch {
    return null;
  }
};

export const setOperator = (label = "Kitchen") => {
  const s: OperatorSession = { label, loggedInAt: new Date().toISOString() };
  localStorage.setItem(LS_OPERATOR, JSON.stringify(s));
};

export const clearOperator = () => localStorage.removeItem(LS_OPERATOR);

export const profileToStudent = (p: Profile): StudentSession => ({
  id: p.id,
  email: p.email,
  full_name: p.full_name,
});
