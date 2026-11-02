import { Navigate, Outlet, Route, Routes, useLocation} from 'react-router-dom'
import { useAuth } from './auth/authContext'
import { RequirePermission } from './pages/auth/requirePermission'
import { Login } from './pages/auth/login'
import { TwoFactor } from './pages/auth/twoFactor'
import { ForgotPassword } from './pages/auth/forgotPassword'
import { ResetPassword } from './pages/auth/resetPassword'
import { MyAccountPage } from './pages/auth/myAccount'
import { NotFound } from './pages/errors/notFound'
import { NoAccess } from './pages/errors/noAccess'
import { SessionExpired } from './pages/errors/sessionExpired'
import { Dashboard } from './pages/dashboard'
import { Applicants } from './pages/applicants/allApplicants'
import { NewApplicantPage } from './pages/applicants/newApplicant'
import { ApplicantProfile } from './pages/applicants/applicantProfile'
import { KycReview } from './pages/applicants/applicantsKYCReview'
import { Preloader } from './components/preloader'
import { LoanApplications } from './pages/loans/loanApplications'
import { LoanApplicationProfile } from './pages/loans/loanApplicationProfile'
import { NewLoanApplicationPage } from './pages/loans/newLoanApplication'
import { ApprovalsPage } from './pages/loans/approvals'
import { ContractsPage } from './pages/loans/contracts'
import { DisbursementsPage } from './pages/loans/disbursements'
import { LoansPage } from './pages/loans/loans'
import { LoanProfile } from './pages/loans/loanProfile'
import { ThemeSettingsPage } from './pages/administration/themeSettings'
import { PaymentsPage } from './pages/loans/payments'
import { PenaltiesPage } from './pages/loans/penalties'
import { CollectionCasesPage } from './pages/collections/collectionCases'
import { RecoveryCasesPage } from './pages/collections/recoveryCases'
import { NplPage } from './pages/collections/npl'
import { ChartOfAccountsPage } from './pages/accounting/chartOfAccounts'
import { GlTransactionsPage } from './pages/accounting/glTransactions'
import { ReportsPage } from './pages/reports/reports'
import { UsersPage } from './pages/administration/users/users'
import { RolesPage } from './pages/administration/roles/roles'
import { ApprovalHierarchyPage } from './pages/administration/approvalHierarchy/approvalHierarchy'
import { CompanyProfilePage } from './pages/administration/companyProfile/companyProfile'
import { SecurityPage } from './pages/administration/security/security'
import { NotificationsPage } from './pages/administration/notifications/notifications'
import { AuditPage } from './pages/administration/audit/audit'
import { SecuritiesPage } from './pages/loans/securities'
import { SessionWatcher } from './auth/sessionWatcher'
import { ErrorBoundary } from './components/errorBoundary'

// pages inside this route need a logged-in user
function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}

function LoginRoute() {
  const { isAuthenticated, login } = useAuth()
  // already logged in -> skip the login page
  if (isAuthenticated) return <Navigate to="/" replace />

  // on success the session is set and the line above redirects to the dashboard
  return <Login onLogin={login} />
}

function TwoFactorRoute() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <TwoFactor />
}

function ForgotPasswordRoute() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <ForgotPassword />
}

function ResetPasswordRoute() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <ResetPassword />
}

function App() {
  const { isAuthenticated } = useAuth()
  const { pathname } = useLocation()
  return (
    <>
    <Preloader />
      {isAuthenticated && <SessionWatcher />}
      <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/two-factor" element={<TwoFactorRoute />} />
        <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
        <Route path="/reset-password" element={<ResetPasswordRoute />} />
        <Route path="/session-expired" element={<SessionExpired />} />

          <Route element={<ProtectedRoute />}>
          {/* open to every signed-in user, whatever the role (the 403 page must stay here or it would redirect forever) */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/account" element={<MyAccountPage />} />
          <Route path="/no-access" element={<NoAccess />} />
          <Route path="/notifications" element={<NotificationsPage />} />

          {/* applicants */}
          <Route element={<RequirePermission area="applicants" page="applicants" />}>
            <Route path="/applicants" element={<Applicants />} />
            <Route path="/applicants/:id" element={<ApplicantProfile />} />
            <Route element={<RequirePermission area="applicants" page="applicants" action="create" />}>
              <Route path="/applicants/new" element={<NewApplicantPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission area="applicants" page="kyc-review" />}>
            <Route path="/kyc-review" element={<KycReview />} />
          </Route>

          {/* loans */}
          <Route element={<RequirePermission area="loans" page="applications" />}>
            <Route path="/loan-applications" element={<LoanApplications />} />
            <Route path="/loan-applications/:id" element={<LoanApplicationProfile />} />
            <Route element={<RequirePermission area="loans" page="applications" action="create" />}>
              <Route path="/loan-applications/new" element={<NewLoanApplicationPage />} />
            </Route>
          </Route>
          <Route element={<RequirePermission area="loans" page="approvals" />}>
            <Route path="/loan-approvals" element={<ApprovalsPage />} />
          </Route>
          <Route element={<RequirePermission area="loans" page="contracts" />}>
            <Route path="/loan-contracts" element={<ContractsPage />} />
          </Route>
          <Route element={<RequirePermission area="loans" page="securities" />}>
            <Route path="/collateral-guarantors" element={<SecuritiesPage />} />
          </Route>
          <Route element={<RequirePermission area="loans" page="disbursements" />}>
            <Route path="/loan-disbursements" element={<DisbursementsPage />} />
          </Route>
          <Route element={<RequirePermission area="loans" page="loans" />}>
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/loans/:id" element={<LoanProfile />} />
          </Route>

          {/* repayments */}
          <Route element={<RequirePermission area="repayments" page="payments" />}>
            <Route path="/payments" element={<PaymentsPage />} />
          </Route>
          <Route element={<RequirePermission area="repayments" page="penalties" />}>
            <Route path="/penalties" element={<PenaltiesPage />} />
          </Route>

          {/* collections */}
          <Route element={<RequirePermission area="collections" page="collection-cases" />}>
            <Route path="/collection-cases" element={<CollectionCasesPage />} />
          </Route>
          <Route element={<RequirePermission area="collections" page="recovery-cases" />}>
            <Route path="/recovery-cases" element={<RecoveryCasesPage />} />
          </Route>
          <Route element={<RequirePermission area="collections" page="npl" />}>
            <Route path="/npl" element={<NplPage />} />
          </Route>

          {/* accounting */}
          <Route element={<RequirePermission area="accounting" page="chart-of-accounts" />}>
            <Route path="/chart-of-accounts" element={<ChartOfAccountsPage />} />
          </Route>
          <Route element={<RequirePermission area="accounting" page="gl-transactions" />}>
            <Route path="/gl-transactions" element={<GlTransactionsPage />} />
          </Route>

          {/* reports: one page, so the guard asks about the area */}
          <Route element={<RequirePermission area="reports" />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>

          {/* administration */}
          <Route element={<RequirePermission area="administration" page="users" />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>
          <Route element={<RequirePermission area="administration" page="roles" />}>
            <Route path="/roles" element={<RolesPage />} />
          </Route>
          <Route element={<RequirePermission area="administration" page="approval-hierarchy" />}>
            <Route path="/approval-hierarchy" element={<ApprovalHierarchyPage />} />
          </Route>
          <Route element={<RequirePermission area="administration" page="company-profile" />}>
            <Route path="/company-profile" element={<CompanyProfilePage />} />
          </Route>
          <Route element={<RequirePermission area="administration" page="security" />}>
            <Route path="/security" element={<SecurityPage />} />
          </Route>
          <Route element={<RequirePermission area="administration" page="audit" />}>
            <Route path="/audit" element={<AuditPage />} />
          </Route>
          <Route element={<RequirePermission area="administration" page="theme-settings" />}>
            <Route path="/theme-settings" element={<ThemeSettingsPage />} />
          </Route>

          {/* new pages go here: add the page to rolesData.ts, then wrap its route in its own guard */}
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      </ErrorBoundary>
    </>
  )
}

export default App