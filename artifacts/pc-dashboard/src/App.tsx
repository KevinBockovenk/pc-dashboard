import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import Dashboard from './pages/dashboard';
import PasswordGate from './components/password-gate';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route>
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground font-mono">
          <p>404 | NOT FOUND</p>
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
          <PasswordGate>
            <Router />
          </PasswordGate>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
