"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setError("No pudimos enviar el link. Verificá el email e intentá de nuevo.");
      return;
    }
    setSent(true);
  };

  return (
    <div className="w-full max-w-md">
      {/* Logo KMA */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center mb-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-bordo rounded-2xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-2xl tracking-tight">K</span>
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold text-gray-900 leading-tight">KMA</p>
              <p className="text-sm text-gray-500 tracking-widest uppercase font-medium">Consultores</p>
            </div>
          </div>
        </div>
        <div className="h-px bg-gray-200 mx-8" />
        <p className="text-sm text-gray-400 mt-4 tracking-wide uppercase font-medium">
          Sistema de Gestión de Sueldos
        </p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        {sent ? (
          <div className="text-center py-2">
            <div className="w-12 h-12 bg-bordo/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-bordo" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Revisá tu email</h2>
            <p className="text-sm text-gray-400">
              Te enviamos un link de acceso a <span className="font-medium text-gray-600">{email}</span>.
              Abrilo desde este mismo dispositivo para ingresar.
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-sm font-medium text-bordo hover:underline mt-5"
            >
              Usar otro email
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Iniciar sesión</h2>
            <p className="text-sm text-gray-400 mb-6">
              Ingresá tu email y te mandamos un link de acceso, sin contraseña.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-bordo/20 focus:border-bordo text-sm transition-all placeholder:text-gray-300"
                  placeholder="nombre@kma.com.ar"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-danger mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-bordo hover:bg-bordo-dark text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2 text-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Enviando...
                  </span>
                ) : (
                  "Enviar link de acceso"
                )}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        BOS · Baires Outsourcing System · v1.0
      </p>
    </div>
  );
}
