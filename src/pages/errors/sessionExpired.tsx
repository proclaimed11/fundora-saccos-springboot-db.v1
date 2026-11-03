import { useNavigate } from 'react-router-dom'
import { Button } from '@mantine/core'
import { AppIcon } from '../../components/appIcon'
import { useAuth } from '../../auth/authContext'
import { ErrorPage } from './errorPage'
import { savedSessionLimits } from '../../api/session'


export function SessionExpired() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { idleTimeoutMinutes, absoluteTimeoutHours } = savedSessionLimits()

  const signInAgain = () => {
    // clear the old token first, otherwise the sign-in page sends a signed-in user straight back home
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <ErrorPage
      code="401"
      icon="clock"
      title="Your session has expired"
      message={`For your safety you are signed out after ${idleTimeoutMinutes} minutes without activity, or ${absoluteTimeoutHours} hours after signing in. Sign in again to continue.`}
    >
      <Button leftSection={<AppIcon name="log-out" />} onClick={signInAgain}>
        Sign in again
      </Button>
    </ErrorPage>
  )
}