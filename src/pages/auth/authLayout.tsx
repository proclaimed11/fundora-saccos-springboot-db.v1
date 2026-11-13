import type { ReactNode } from 'react'
import logo from '../../assets/logo.png'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-content-background p-4 sm:p-6">
      <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.12)] sm:min-h-[28rem] sm:flex-row">
        <div className="flex min-h-44 items-center justify-center bg-brand-subtle p-8 sm:min-h-0 sm:w-1/2 sm:p-10">
          <img src={logo} alt="Fundora Saccos" className="h-auto w-full max-w-sm object-contain" />
        </div>
        <div className="flex w-full items-center p-6 sm:w-1/2 sm:p-10 lg:p-14">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  )
}
