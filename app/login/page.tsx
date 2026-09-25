'use client'
import Image from "next/image"

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Headphones, Eye, EyeOff } from 'lucide-react'
import { useOrg } from '@/components/OrgProvider'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [showTwoFactor, setShowTwoFactor] = useState(false)
  const [tempUserId, setTempUserId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const { orgName, orgLogo } = useOrg()

  // Cargar email guardado al iniciar
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail')
    if (savedEmail) {
      setEmail(savedEmail)
      setRememberMe(true)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Primero verificar si el usuario tiene 2FA activado
      const checkResponse = await fetch('/api/auth/check-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      })

      if (checkResponse.ok) {
        const data = await checkResponse.json()
        
        if (data.requires2FA) {
          // Mostrar pantalla de 2FA
          setTempUserId(data.userId)
          setShowTwoFactor(true)
          setLoading(false)
          return
        }
      }

      // Si no requiere 2FA, proceder con login normal
      const result = await signIn('credentials', {
        redirect: false,
        email: email.trim(),
        password,
      })

      if (result?.error) {
        setError(result.error === 'CredentialsSignin' ? 'Correo o contraseña incorrectos.' : `No se pudo iniciar sesión (${result.error}).`)
      } else {
        // Guardar o eliminar email según la opción de recordar
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email)
        } else {
          localStorage.removeItem('rememberedEmail')
        }
        router.push('/dashboard')
      }
    } catch (error) {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Verificar código 2FA
      const verifyResponse = await fetch('/api/auth/verify-2fa-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password,
          twoFactorCode 
        })
      })

      if (verifyResponse.ok) {
        // Proceder con login
        const result = await signIn('credentials', {
          redirect: false,
          email,
          password,
          twoFactorCode,
        })

        if (result?.error) {
          setError('Código de verificación inválido')
        } else {
          if (rememberMe) {
            localStorage.setItem('rememberedEmail', email)
          } else {
            localStorage.removeItem('rememberedEmail')
          }
          router.push('/dashboard')
        }
      } else {
        const error = await verifyResponse.json()
        setError(error.error || 'Código de verificación inválido')
      }
    } catch (error) {
      setError('Error al verificar código')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="brand-login min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="brand-login-card bg-white rounded-2xl p-6 sm:p-10 max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            {orgLogo ? (
              <Image width={112} height={112} sizes="112px" priority unoptimized={!orgLogo.startsWith("/")} src={orgLogo} alt={orgName} className="h-28 w-28 rounded-xl object-contain" />
            ) : (
              <Headphones className="h-12 w-12 text-primary-600" />
            )}
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            {showTwoFactor ? 'Verificación de Dos Factores' : 'Iniciar Sesión'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {showTwoFactor 
              ? 'Ingresa el código de tu aplicación de autenticación' 
              : `Accede a tu cuenta de ${orgName}`}
          </p>
          <div className="brand-stripe mt-6 rounded-full" aria-hidden="true" />
        </div>

        {!showTwoFactor ? (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="email" className="sr-only">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="relative">
                <label htmlFor="password" className="sr-only">
                  Contraseña
                </label>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="appearance-none rounded-none relative block w-full pl-3 pr-12 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-1 text-primary-600 rounded focus:outline-none focus:ring-2 focus:ring-primary-500">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                  Recordar contraseña
                </label>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
            </div>

            <div className="text-center">
              <Link href="/register" className="text-primary-600 hover:text-primary-700">
                ¿No tienes cuenta? Regístrate
              </Link>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleTwoFactorSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                Abre tu aplicación de autenticación e ingresa el código de 6 dígitos
              </p>
            </div>

            <div>
              <label htmlFor="twoFactorCode" className="sr-only">
                Código de verificación
              </label>
              <input
                id="twoFactorCode"
                name="twoFactorCode"
                type="text"
                maxLength={6}
                required
                className="appearance-none relative block w-full px-3 py-4 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-center text-2xl font-mono tracking-widest"
                placeholder="000000"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowTwoFactor(false)
                  setTwoFactorCode('')
                  setError('')
                }}
                className="flex-1 py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={loading || twoFactorCode.length !== 6}
                className="flex-1 py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {loading ? 'Verificando...' : 'Verificar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
