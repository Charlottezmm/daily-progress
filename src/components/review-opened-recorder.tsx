"use client";

import { useEffect } from "react";

let recordedInThisSession = false;

export function ReviewOpenedRecorder() {
  useEffect(() => {
    if (recordedInThisSession) return;
    recordedInThisSession = true;
    void fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventKey: "review_opened" }),
    }).catch(() => {
      recordedInThisSession = false;
    });
  }, []);

  return null;
}
