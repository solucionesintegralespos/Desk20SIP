import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import { rateLimitAll, clientIp, LOGIN_LIMITS, TWO_FACTOR_LIMITS } from '@/lib/rate-limit'

export const INACTIVE_USER = 'USUARIO_INACTIVO'
export const TOO_MANY_ATTEMPTS = 'DEMASIADOS_INTENTOS'
export const TWO_FACTOR_REQUIRED = 'CODIGO_2FA_INVALIDO'

// Cookie transport follows the deployment URL, including local HTTP on the LAN.
const secureCookies = process.env.NEXTAUTH_URL
  ? new URL(process.env.NEXTAUTH_URL).protocol === 'https:'
  : process.env.NODE_ENV === 'production'

export const authOptions: NextAuthOptions = {
  useSecureCookies: secureCookies,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorCode: { label: "Código 2FA", type: "text" }
      },
      async authorize(credentials, req) {
        // IMPORTANTE: El login NO debe verificar REGISTRATION_ENABLED
        // Esta variable solo controla el REGISTRO de nuevos usuarios, no el acceso
        if (!credentials?.email || !credentials?.password) {
          return null
        }
        if (!rateLimitAll(LOGIN_LIMITS(credentials.email, clientIp(req?.headers))).ok) {
          throw new Error(TOO_MANY_ATTEMPTS)
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email.trim()
          }
        })

        if (!user || !user.password || !user.email) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!isPasswordValid) {
          return null
        }

        // Checked after the password so the message never reveals which accounts exist.
        if (!user.active) {
          throw new Error(INACTIVE_USER)
        }

        // Two-factor is enforced here, on the server: the separate pre-check endpoints only drive
        // the login screen and must not be the only gate.
        if (user.twoFactorEnabled) {
          const code = credentials.twoFactorCode?.trim() || ''
          if (!rateLimitAll(TWO_FACTOR_LIMITS(user.email)).ok) throw new Error(TOO_MANY_ATTEMPTS)
          if (!user.twoFactorSecret || !/^\d{6}$/.test(code) || !authenticator.verify({ token: code, secret: user.twoFactorSecret })) {
            throw new Error(TWO_FACTOR_REQUIRED)
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 días por defecto
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        return token
      }
      // Sessions last 30 days: re-check on every request so deactivating (or deleting) a user
      // ends their open sessions. Throwing here makes next-auth drop the session cookie and
      // getServerSession return null everywhere.
      if (token.id) {
        let account: { active: boolean } | null | undefined
        try {
          account = await prisma.user.findUnique({ where: { id: token.id as string }, select: { active: true } })
        } catch (error) {
          // A database outage must not sign everyone out; the request fails on its own queries.
          console.error('No se pudo verificar el estado del usuario', error)
        }
        if (account === null || account?.active === false) throw new Error(INACTIVE_USER)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    }
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: secureCookies
      }
    }
  }
}
