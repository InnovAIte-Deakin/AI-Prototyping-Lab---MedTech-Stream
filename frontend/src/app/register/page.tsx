"use client";

import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!role) {
      setError("Role is required.");
      return;
    }

    setError("");
  }

  return (
    <main>
      <h1>Register</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label htmlFor="role">Role</label>
        <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Select a role</option>
          <option value="patient">Patient</option>
          <option value="caregiver">Caregiver</option>
          <option value="clinician">Clinician</option>
        </select>

        <button type="submit">Create account</button>
      </form>

      {error ? <p>{error}</p> : null}
    </main>
  );
}