import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { VoiceCallModal } from './components/VoiceCallModal';
import { AuthModal } from './components/AuthModal';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { LearningPage } from './pages/LearningPage';
import { StockAnalysisPage } from './pages/StockAnalysisPage';
import { RiskAssessmentPage } from './pages/RiskAssessmentPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { PredictionsPage } from './pages/PredictionsPage';
import { NewsPage } from './pages/NewsPage';
import { AlertsPage } from './pages/AlertsPage';
import { SettingsPage } from './pages/SettingsPage';
import { MetalsPage } from './pages/MetalsPage';
import { OnboardingModal } from './components/OnboardingModal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { getToken, getStoredUser, removeToken, api, setToken, setStoredUser } from './services/api';

export function App() {
  const [user, setUser] = useState<any>(() => {
    const token = getToken();
    return token ? getStoredUser() : null;
  });
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedStock, setSelectedStock] = useState<string>('SBIN');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(2);
  const [profileVersion, setProfileVersion] = useState(0);

  // Check initial token on boot
  useEffect(() => {
    const handleAuthLogout = () => {
      setUser(null);
    };
    window.addEventListener('finsight:auth_logout', handleAuthLogout);

    const token = getToken();
    if (token) {
      api.auth.me()
        .then(u => {
          if (u && u.id) {
            setUser(u);
            setStoredUser(u);
          } else {
            removeToken();
            setStoredUser(null);
            setUser(null);
          }
        })
        .catch(() => {
          removeToken();
          setStoredUser(null);
          setUser(null);
        });
    } else {
      removeToken();
      setStoredUser(null);
      setUser(null);
    }

    return () => {
      window.removeEventListener('finsight:auth_logout', handleAuthLogout);
    };
  }, []);

  const handleLogout = () => {
    removeToken();
    setStoredUser(null);
    setUser(null);
  };

  const handleSelectStock = (symbol: string) => {
    setSelectedStock(symbol);
    setCurrentTab('stocks');
  };

  const handleExploreDemo = async () => {
    try {
      const res = await api.auth.login({ email: 'demo@finsight.ai', password: 'password123' });
      if (res && res.access_token && res.user) {
        setToken(res.access_token);
        setStoredUser(res.user);
        setUser(res.user);
        setCurrentTab('dashboard');
        return;
      }
      throw new Error('Incomplete login response');
    } catch {
      // If login fails, try registration
      try {
        const regRes = await api.auth.register({
          name: 'Alex Mercer',
          email: 'demo@finsight.ai',
          password: 'password123',
          phone: '+1 (415) 555-2671',
        });
        if (regRes && regRes.access_token && regRes.user) {
          setToken(regRes.access_token);
          setStoredUser(regRes.user);
          setUser(regRes.user);
          setCurrentTab('dashboard');
          return;
        }
        throw new Error('Incomplete registration response');
      } catch {
        // Fallback demo mock
        const fallback = {
          id: 'demo-user-1',
          name: 'Alex Mercer',
          email: 'demo@finsight.ai',
          phone: '+1 (415) 555-2671',
        };
        setUser(fallback);
        setCurrentTab('dashboard');
      }
    }
  };

  // If user is not logged in and not in demo mode, show Landing Page
  if (!user) {
    return (
      <>
        <LandingPage
          onGetStarted={() => setIsAuthModalOpen(true)}
          onExploreDemo={handleExploreDemo}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={(loggedUser) => {
            setUser(loggedUser);
            setCurrentTab('dashboard');
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-row font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Desktop & Collapsible Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        alertCount={unreadAlerts}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Navbar */}
        <Navbar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          user={user}
          onLogout={handleLogout}
          onSelectStock={handleSelectStock}
          unreadAlertCount={unreadAlerts}
          onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
        />

        {/* Dynamic Page Views */}
        <main className="flex-1 pb-16">
          {currentTab === 'dashboard' && (
            <ErrorBoundary pageName="Dashboard">
              <DashboardPage
                onNavigateTab={setCurrentTab}
                onSelectStock={handleSelectStock}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'discovery' && (
            <ErrorBoundary pageName="Discovery">
              <DiscoveryPage
                key={profileVersion}
                profileVersion={profileVersion}
                onSelectStock={handleSelectStock}
                onNavigateTab={setCurrentTab}
                onOpenOnboarding={() => setIsOnboardingOpen(true)}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'learning' && (
            <ErrorBoundary pageName="Learning Center">
              <LearningPage />
            </ErrorBoundary>
          )}

          {currentTab === 'stocks' && (
            <ErrorBoundary pageName="Stock Analysis">
              <StockAnalysisPage
                initialSymbol={selectedStock}
                onSelectStock={setSelectedStock}
                onNavigateTab={setCurrentTab}
              />
            </ErrorBoundary>
          )}

          {(currentTab === 'metals' || currentTab === 'gold') && (
            <ErrorBoundary pageName="Metals & Bullion">
              <MetalsPage
                onSelectStock={handleSelectStock}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'risk' && (
            <ErrorBoundary pageName="Risk Assessment">
              <RiskAssessmentPage
                initialSymbol={selectedStock}
                onSelectStock={handleSelectStock}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'portfolio' && (
            <ErrorBoundary pageName="Portfolio Management">
              <PortfolioPage
                onSelectStock={handleSelectStock}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'watchlist' && (
            <ErrorBoundary pageName="Watchlist">
              <WatchlistPage
                onSelectStock={handleSelectStock}
                onNavigateTab={setCurrentTab}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'predictions' && (
            <ErrorBoundary pageName="Predictions & Signals">
              <PredictionsPage
                initialSymbol={selectedStock}
                onSelectStock={handleSelectStock}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'news' && (
            <ErrorBoundary pageName="News & Sentiment">
              <NewsPage
                onSelectStock={handleSelectStock}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'alerts' && (
            <ErrorBoundary pageName="Alerts">
              <AlertsPage
                onSelectStock={handleSelectStock}
                onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'settings' && (
            <ErrorBoundary pageName="Settings">
              <SettingsPage
                onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
              />
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* Global Interactive Voice Call Alert Modal */}
      <VoiceCallModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        defaultSymbol={selectedStock}
      />

      {/* Beginner Investor Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={() => {
          setProfileVersion(v => v + 1);
          setCurrentTab('discovery');
        }}
      />
    </div>
  );
}

export default App;
