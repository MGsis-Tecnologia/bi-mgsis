"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate login
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1000);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Hero Section */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#0a1f3d] to-[#1a3a5c] text-white flex-col justify-between p-12 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob" />
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000" />
        </div>

        {/* Content */}
        <div className="relative z-10">
          {/* Logo & Title */}
          <div className="mb-20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">⊕</span>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-widest">MGSIS ANALYTICS</h1>
                <p className="text-xs text-blue-200">Business Intelligence Platform</p>
              </div>
            </div>
          </div>

          {/* Main Headline */}
          <div className="mb-24">
            <p className="text-xs font-semibold tracking-widest text-blue-300 mb-4">INTELIGENCIA COMERCIAL</p>
            <h2 className="font-serif text-5xl leading-tight font-bold mb-6">
              Los datos que transforman decisiones.
            </h2>
            <p className="text-lg text-blue-100 max-w-md">
              Análisis en tiempo real, insights accionables y rentabilidad mensurable. Tu ERP conectado a la inteligencia que impulsa el crecimiento.
            </p>
          </div>
        </div>

        {/* Metrics Footer */}
        <div className="relative z-10 grid grid-cols-3 gap-6 border-t border-blue-300/20 pt-12">
          <div>
            <div className="text-4xl font-bold mb-2">+320%</div>
            <p className="text-xs text-blue-200">Precisión Analytics</p>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">Real-time</div>
            <p className="text-xs text-blue-200">Actualización datos</p>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">24/7</div>
            <p className="text-xs text-blue-200">Disponibilidad</p>
          </div>
        </div>

        {/* Footer Branding */}
        <div className="relative z-10 text-xs text-blue-300 tracking-widest">
          MGSIS TECNOLOGÍA · PY · 2026
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 bg-slate-50 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">⊕</span>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-widest text-slate-900">MGSIS ANALYTICS</h1>
              </div>
            </div>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <p className="text-xs font-semibold tracking-widest text-slate-500 mb-3">ACCEDER AL PANEL</p>
            <h2 className="font-serif text-3xl font-bold text-slate-900 mb-2">Ingresa a tu cuenta</h2>
            <p className="text-sm text-slate-600">
              Continúa con el correo registrado. Los campos vienen pre-completados para demostración.
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Correo corporativo
              </label>
              <input
                type="email"
                defaultValue="mgsis@mgsis.com"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                readOnly
              />
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Contraseña</label>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  Olvidé mi contraseña
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  defaultValue="••••••••"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10"
                  readOnly
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Session */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="remember"
                defaultChecked
                className="w-4 h-4 border border-slate-300 rounded bg-white accent-blue-600 cursor-pointer"
              />
              <label htmlFor="remember" className="text-sm text-slate-700 cursor-pointer">
                Mantener sesión iniciada por 7 días
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-75 disabled:cursor-not-allowed mt-6 shadow-lg hover:shadow-xl"
            >
              {isLoading ? "Ingresando..." : "Ingresar al panel"}
            </button>
          </form>

          {/* Footer Links */}
          <p className="text-xs text-slate-500 text-center mt-6">
            Al continuar, aceptas los{" "}
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
              Términos de Uso
            </a>
            {" "}y{" "}
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
              Política de Privacidad
            </a>
            {" "}de MGSIS Analytics.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}
