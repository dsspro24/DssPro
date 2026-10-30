import { lazy, Suspense, useEffect, useState } from 'react';
import CloudEntry from './CloudEntry.jsx';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';
import { 
  Home, 
  BookOpen, 
  Users, 
  Upload, 
  Shirt, 
  Lock, 
  ChevronRight, 
  LogOut,
  Award,
  CheckSquare,
  Square,
  Sparkles,
  FileText,
  Search,
  Check,
  Key,
  CreditCard,
  FileBarChart
} from 'lucide-react';

const LocalWorkspace = lazy(() => import('./LocalWorkspace.jsx'));

export default function App() {
  return isSupabaseConfigured ? <CloudLandingGate /> : <DemoApp />;
}

function CloudLandingGate() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!authReady) return <main className="grid min-h-screen place-items-center bg-slate-100 px-4"><p className="text-sm text-slate-600">Jungiama prie DSS Pro…</p></main>;
  return session ? <CloudEntry onExit={() => setSession(null)} /> : <DemoApp cloudMode />;
}

function DemoApp({ cloudMode = false }) {
  // Navigation / Tabs state
  const [currentPage, setCurrentPage] = useState('landing'); // 'landing' | 'app'
  const [sandboxMode, setSandboxMode] = useState(false);
  const [sandboxContent, setSandboxContent] = useState(null);
  const [sandboxStarting, setSandboxStarting] = useState(false);
  const [sandboxStartError, setSandboxStartError] = useState('');
  const [userRole, setUserRole] = useState('darbuotojas'); // 'darbuotojas' | 'dss' | 'vadovas' | 'kurejas'
  const [activeTab, setActiveTab] = useState('skydelis'); 
  const [courseFilter, setCourseFilter] = useState('visi'); // 'visi' | 'mano' | 'baigti'
  const [registerRole, setRegisterRole] = useState('vadovas');
  const [registerPlan, setRegisterPlan] = useState('standard');
  const [cloudSignupFeedback, setCloudSignupFeedback] = useState('');
  const [signupConfirmationEmail, setSignupConfirmationEmail] = useState('');
  const [signupSubmitting, setSignupSubmitting] = useState(false);

  const scrollToSignup = () => {
    const signupSection = document.getElementById('pricing-signup');
    if (!signupSection) return;
    window.scrollTo({
      top: Math.max(0, signupSection.getBoundingClientRect().top + window.scrollY - 24),
      behavior: 'smooth',
    });
  };

  const startSandbox = async () => {
    setSandboxStarting(true);
    setSandboxStartError('');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}demo-content.json`);
      if (!response.ok) throw new Error(`Demo turinio paketo įkelti nepavyko (${response.status}).`);
      const content = await response.json();
      if (content?.version !== 1 || !Array.isArray(content.resources)) {
        throw new Error('Demo turinio paketo formatas netinkamas.');
      }
      setSandboxContent(content);
      setSandboxMode(true);
      setUserRole('darbuotojas');
      setCurrentPage('app');
      setActiveTab('uzduotys');
    } catch (error) {
      setSandboxStartError(error instanceof Error ? error.message : String(error));
    } finally {
      setSandboxStarting(false);
    }
  };

  // Interactive Mock States
  const [sizes, setSizes] = useState({ shoes: '43', clothing: 'L', pants: '50', height: '182', weight: '80' });

  const [courses, setCourses] = useState([
    {
      id: 1,
      title: "Darbas aukštyje ir saugos diržai",
      category: "Instruktavimai",
      type: "Instruktavimas",
      time: "20min",
      status: "Neatliktas",
      img: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=500"
    },
    {
      id: 2,
      title: "Buitinės chemijos naudojimas IR apsauga",
      category: "Instruktavimai",
      type: "Instruktavimas",
      time: "15min",
      status: "Vykdomas",
      img: "https://images.unsplash.com/photo-1582139329536-e7284fece509?w=500"
    },
    {
      id: 3,
      title: "Bendroji gaisrinė sauga",
      category: "Instruktavimai",
      type: "Instruktavimas",
      time: "30min",
      status: "Baigtas",
      img: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500"
    },
    {
      id: 4,
      title: "Pėstųjų elgesys pavojingoje zonoje",
      category: "Instruktavimai",
      type: "Instruktavimas",
      time: "45min",
      status: "Neatliktas",
      img: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=500"
    }
  ]);

  const [dssDocuments, setDssDocuments] = useState([
    { id: 1, company: "UAB „Statybų ekspertai“", docName: "Priešgaisrinės saugos žurnalas", worker: "Jonas Petraitis", date: "2026-10-12", selected: false, signed: false },
    { id: 2, company: "UAB „Statybų ekspertai“", docName: "AAP išdavimo kortelė #88", worker: "Petras Petraitis", date: "2026-10-13", selected: false, signed: false },
    { id: 3, company: "UAB „Logistikos centras“", docName: "Įvadinio instruktavimo žurnalas", worker: "Rasa Norkienė", date: "2026-10-13", selected: false, signed: false }
  ]);

  const [teamMembers, setTeamMembers] = useState([
    { id: 1, name: "Jonas Petraitis", role: "Operatorius", status: "Aktyvus", email: "jonas@imone.lt" },
    { id: 2, name: "Petras Petraitis", role: "Vairuotojas", status: "Laukia instruktavimo", email: "petras@imone.lt" },
    { id: 3, name: "Rasa Kazlauskienė", role: "Sandėlininkė", status: "Aktyvus", email: "rasa@imone.lt" }
  ]);

  const [employeesReport] = useState([
    { id: 101, name: "Jonas Petraitis", role: "Operatorius", aapSigned: true, aapDate: "2026-10-12 14:20", testScore: 90, journalWorker: true, journalDss: true, ip: "192.168.1.45" },
    { id: 102, name: "Petras Petraitis", role: "Vairuotojas", aapSigned: false, aapDate: "-", testScore: 60, journalWorker: false, journalDss: false, ip: "-" },
    { id: 103, name: "Rasa Kazlauskienė", role: "Sandėlininkė", aapSigned: true, aapDate: "2026-10-13 09:15", testScore: 100, journalWorker: true, journalDss: false, ip: "192.168.1.88" }
  ]);

  // Modals & form states
  const [showPinModal, setShowPinModal] = useState(false);
  const [showBulkPinModal, setShowBulkPinModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [selectAll, setSelectAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourseForTest, setSelectedCourseForTest] = useState(null);

  const [quizAnswers, setQuizAnswers] = useState({ q1: '', q2: '' });
  const [testScore, setTestScore] = useState(null);
  const [testStep, setTestStep] = useState('quiz');
  const [newTemplateTitle, setNewTemplateTitle] = useState('');

  // Handlers
  const handleToggleSelectAll = () => {
    const nextState = !selectAll;
    setSelectAll(nextState);
    setDssDocuments(dssDocuments.map(doc => ({ ...doc, selected: doc.signed ? false : nextState })));
  };

  const handleToggleSelect = (id) => {
    setDssDocuments(dssDocuments.map(doc => doc.id === id && !doc.signed ? { ...doc, selected: !doc.selected } : doc));
  };

  const handleBulkSign = (e) => {
    e.preventDefault();
    if (pinCode.length < 4) return alert("Įveskite teisingą 4 skaitmenų PIN kodą!");
    const count = dssDocuments.filter(d => d.selected).length;
    setDssDocuments(dssDocuments.map(d => d.selected ? { ...d, signed: true, selected: false } : d));
    setShowBulkPinModal(false);
    setPinCode('');
    setSelectAll(false);
    alert(`Sėkmingai pasirašyti visi ${count} pasirinkti dokumentai vienu PIN kodu!`);
  };

  const handleCalculateTest = (e) => {
    e.preventDefault();
    let score = 0;
    if (quizAnswers.q1 === 'correct') score += 50;
    if (quizAnswers.q2 === 'correct') score += 50;
    setTestScore(score);
    if (score >= 80) setTestStep('pin');
  };

  const handleWorkerSignTest = (e) => {
    e.preventDefault();
    if (pinCode.length < 4) return alert("Įveskite 4 skaitmenų PIN kodą!");
    if (selectedCourseForTest) {
      setCourses(courses.map(c => c.id === selectedCourseForTest.id ? { ...c, status: 'Baigtas' } : c));
    }
    alert(`Testas išlaikytas (${testScore}%). Žurnalas patvirtintas Jūsų PIN kodu!`);
    setShowTestModal(false);
    setTestStep('quiz');
    setPinCode('');
  };

  const handleRoleChange = (newRole) => {
    setUserRole(newRole);
    setActiveTab('skydelis');
  };

  const handleCloudSignup = async (event) => {
    event.preventDefault();
    setCloudSignupFeedback('');
    const signupForm = new FormData(event.currentTarget);
    const fullName = String(signupForm.get('fullName') ?? '').trim();
    const email = String(signupForm.get('email') ?? '').trim();
    const password = String(signupForm.get('password') ?? '');
    const companyName = String(signupForm.get('companyName') ?? '').trim();
    const companyCode = String(signupForm.get('companyCode') ?? '').trim();
    const signingPin = String(signupForm.get('signingPin') ?? '');
    const confirmSigningPin = String(signupForm.get('confirmSigningPin') ?? '');

    if (!/^\d{4}$/.test(signingPin) || signingPin !== confirmSigningPin) {
      setCloudSignupFeedback('Pasirašymo PIN turi būti 4 skaitmenys, o abu įrašai turi sutapti.');
      return;
    }

    setSignupConfirmationEmail(email);
    setSignupSubmitting(true);
    document.getElementById('signup-confirmation-dialog')?.showModal();
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            account_type: registerRole === 'dss' ? 'dss_specialist' : 'manager',
            ...(registerRole === 'vadovas' ? { plan_code: registerPlan } : { plan_code: 'free' }),
            ...(registerRole === 'vadovas' ? { company_name: companyName, company_code: companyCode } : {}),
            signing_pin: signingPin,
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      if (data.session) {
        document.getElementById('signup-confirmation-dialog')?.close();
        setCurrentPage('app');
      }
      setSignupSubmitting(false);
    } catch (error) {
      document.getElementById('signup-confirmation-dialog')?.close();
      setSignupSubmitting(false);
      const cooldown = error.message?.match(/only request this after\s+(\d+)\s+seconds?/i);
      setCloudSignupFeedback(cooldown
        ? `Dėl saugumo registracijos nuorodos galima prašyti dar kartą po ${cooldown[1]} sek.`
        : error.message || 'Nepavyko sukurti paskyros. Patikrinkite duomenis.');
    }
  };

  const selectedDocsCount = dssDocuments.filter(d => d.selected).length;

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (courseFilter === 'mano') return matchesSearch && (course.status === 'Neatliktas' || course.status === 'Vykdomas');
    if (courseFilter === 'baigti') return matchesSearch && course.status === 'Baigtas';
    return matchesSearch;
  });

  // ==========================================
  // LANDING PAGE
  // ==========================================
  if (currentPage === 'landing') {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
        <div className="bg-[#0c4a3b] text-white pt-6 pb-20 px-6">
          <div className="max-w-6xl mx-auto">
            
            <header className="flex items-center justify-between pb-12">
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage('landing')}>
                <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1">
                  Dss
                  <span className="border border-[#20e090] text-[#20e090] text-xs px-2 py-0.5 rounded-full font-semibold">
                    Pro
                  </span>
                </span>
              </div>

              <button 
                onClick={() => { setCurrentPage('app'); setActiveTab('skydelis'); }}
                className="bg-[#20e090] hover:bg-[#1bc880] text-[#0c4a3b] font-bold px-5 py-2 rounded-full text-xs transition-all cursor-pointer shadow-md"
              >
                Prisijungti
              </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center mb-16">
              <div className="lg:col-span-6 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#20e090] text-[11px] font-medium border border-white/10">
                  <Sparkles size={12} /> Skaitmeninė darbuotojų sauga
                </div>

                <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight">
                  DSS žurnalai, testai ir parašai – vienoje vietoje
                </h1>

                <p className="text-emerald-100/80 text-sm max-w-md leading-relaxed">
                  Vadovas pakviečia darbuotojus, priskiria testus ir žurnalus, o visi pasirašo savo PIN kodu.
                </p>

                <div className="flex items-center gap-4 pt-2">
                  <button 
                    onClick={scrollToSignup}
                    className="bg-[#20e090] hover:bg-[#1bc880] text-[#0c4a3b] font-bold px-6 py-3 rounded-xl text-xs transition-all cursor-pointer shadow-lg hover:scale-105"
                  >
                    Peržiūrėti planus
                  </button>
                  <button 
                    onClick={startSandbox}
                    disabled={sandboxStarting}
                    className="border border-white/30 hover:bg-white/10 text-white font-semibold px-6 py-3 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    {sandboxStarting ? 'Ruošiama demo aplinka…' : 'Išbandyti be registracijos'}
                  </button>
                </div>
                {sandboxStartError && <p role="alert" className="mt-3 max-w-md text-sm text-rose-200">{sandboxStartError}</p>}
              </div>

              <div className="lg:col-span-6">
                <div className="bg-white text-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-w-md mx-auto">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PRIEŠGAISRINĖS SAUGOS ŽURNALAS</span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="font-bold text-slate-800">Jonas Petraitis</p>
                        <p className="text-[11px] text-slate-400">Darbuotojas</p>
                      </div>
                      <span className="text-[#1bc880] font-semibold flex items-center gap-1">
                        <Check size={14} /> Pasirašyta PIN kodu
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-t border-slate-50">
                      <div>
                        <p className="font-bold text-slate-800">Rasa Kazlauskienė</p>
                        <p className="text-[11px] text-slate-400">DSS specialistas</p>
                      </div>
                      <span className="text-[#1bc880] font-semibold flex items-center gap-1">
                        <Check size={14} /> Pasirašyta PIN kodu
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-t border-slate-50">
                      <div>
                        <p className="font-bold text-slate-800">Tomas Vaitkus</p>
                        <p className="text-[11px] text-slate-400">Komisijos narys</p>
                      </div>
                      <span className="text-amber-500 font-semibold bg-amber-50 px-2 py-0.5 rounded text-[10px]">
                        Laukia parašo
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              <button type="button" onClick={scrollToSignup} className="w-full text-left bg-white text-slate-800 p-5 rounded-2xl shadow-lg border border-slate-100 cursor-pointer hover:border-emerald-200 hover:shadow-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#1bc880] flex items-center justify-center mb-3">
                  <Lock size={18} />
                </div>
                <h3 className="font-bold text-sm mb-1">Žurnalai su PIN parašu</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Darbuotojai, vadovai, DSS specialistai ir komisija pasirašo savo PIN kodu – be popieriaus.
                </p>
              </button>

              <button type="button" onClick={scrollToSignup} className="w-full text-left bg-white text-slate-800 p-5 rounded-2xl shadow-lg border border-slate-100 cursor-pointer hover:border-emerald-200 hover:shadow-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#1bc880] flex items-center justify-center mb-3">
                  <Award size={18} />
                </div>
                <h3 className="font-bold text-sm mb-1">Testai ir instruktavimai</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Priskirkite gaisrinės, chemijos, elektrosaugos ir kitus testus vienu paspaudimu.
                </p>
              </button>

              <button type="button" onClick={scrollToSignup} className="w-full text-left bg-white text-slate-800 p-5 rounded-2xl shadow-lg border border-slate-100 cursor-pointer hover:border-emerald-200 hover:shadow-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#1bc880] flex items-center justify-center mb-3">
                  <Shirt size={18} />
                </div>
                <h3 className="font-bold text-sm mb-1">Darbuotojo kortelė</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ūgis, svoris, drabužių ir batų dydžiai – AAP išdavimui visada po ranka.
                </p>
              </button>
            </div>

          </div>
        </div>

        {/* KAINOS IR REGISTRACIJA */}
        <div id="pricing-signup" className="max-w-6xl mx-auto scroll-mt-6 px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-6 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Kainos</h2>
              <p className="text-xs text-slate-500 mt-1">
                Moka tik įmonės vadovas. DSS specialistams ir darbuotojams sistema nemokama.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button type="button" aria-pressed={registerRole === 'vadovas' && registerPlan === 'standard'} onClick={() => { setRegisterRole('vadovas'); setRegisterPlan('standard'); }} className={`w-full bg-white p-5 rounded-2xl border text-left shadow-sm space-y-4 ${registerRole === 'vadovas' && registerPlan === 'standard' ? 'border-2 border-emerald-600' : 'border-slate-200'}`}>
                <div>
                  <span className="text-xs font-semibold text-slate-400">Standartinis</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-black text-slate-800">29 €</span>
                    <span className="text-xs text-slate-400">/ mėn.</span>
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><Check size={14} className="text-[#1bc880]" /> Iki 25 darbuotojų</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[#1bc880]" /> VDI žurnalai</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[#1bc880]" /> Visi ataskaitų PDF</li>
                </ul>
                <span className="block text-xs font-semibold text-emerald-800">{registerRole === 'vadovas' && registerPlan === 'standard' ? 'Pasirinktas planas' : 'Pasirinkti planą'}</span>
              </button>

              <button type="button" aria-pressed={registerRole === 'vadovas' && registerPlan === 'pro'} onClick={() => { setRegisterRole('vadovas'); setRegisterPlan('pro'); }} className={`w-full bg-white p-5 rounded-2xl border text-left shadow-sm space-y-4 ${registerRole === 'vadovas' && registerPlan === 'pro' ? 'border-2 border-emerald-600' : 'border-slate-200'}`}>
                <div>
                  <span className="text-xs font-bold text-[#1bc880]">Pro</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-black text-slate-800">79 €</span>
                    <span className="text-xs text-slate-400">/ mėn.</span>
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><Check size={14} className="text-[#1bc880]" /> Neriboti darbuotojai</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[#1bc880]" /> DSS komisija</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[#1bc880]" /> Komisijos ir DSS parašai</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-[#1bc880]" /> Prioritetinė pagalba</li>
                </ul>
                <span className="block text-xs font-semibold text-emerald-800">{registerRole === 'vadovas' && registerPlan === 'pro' ? 'Pasirinktas planas' : 'Pasirinkti planą'}</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-md">
            <h3 className="font-bold text-slate-800 text-base mb-1">Sukurkite paskyrą</h3>
            <p className="mb-4 text-xs text-slate-500">Vadovo paskyrai reikia mokamo plano. DSS paskyra nemokama; darbuotojai prisijungia vadovo kvietimu.</p>

            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs mb-5 font-semibold">
              <button 
                onClick={() => setRegisterRole('vadovas')}
                className={`py-2 rounded-lg text-center cursor-pointer transition-all ${registerRole === 'vadovas' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                Vadovas · mokama
              </button>
              <button 
                onClick={() => setRegisterRole('dss')}
                className={`py-2 rounded-lg text-center cursor-pointer transition-all ${registerRole === 'dss' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                DSS specialistas · nemokama
              </button>
            </div>
            {cloudMode && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-950">
              {registerRole === 'vadovas'
                ? `Pasirinktas ${registerPlan === 'standard' ? 'Standartinis' : 'Pro'} planas. Sukurkite paskyrą ir patvirtinkite el. paštą; prisijungę užbaigsite įmonės nustatymą.`
                : 'Sukurkite atskirą DSS specialisto paskyrą ir patvirtinkite el. paštą. Įmonės duomenų įvesti nereikia; vadovo kvietimą priimsite prisijungę.'}
            </p>}

            <form onSubmit={cloudMode ? handleCloudSignup : (e) => { e.preventDefault(); setCurrentPage('app'); setUserRole(registerRole); setActiveTab('skydelis'); }} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Vardas ir pavardė</label>
                <input name="fullName" type="text" required placeholder="Jonas Jonaitis" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">El. paštas</label>
                <input name="email" type="email" required placeholder="jonas@imone.lt" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" />
              </div>

              {cloudMode && <div><label className="block text-slate-500 mb-1">Slaptažodis</label><input name="password" type="password" minLength={8} autoComplete="new-password" required placeholder="Bent 8 simboliai" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" /></div>}

              {(!cloudMode || registerRole === 'vadovas') && <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Įmonės pavadinimas</label>
                  <input name="companyName" type="text" required={!cloudMode || registerRole === 'vadovas'} placeholder="UAB Įmonė" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Įmonės kodas</label>
                  <input name="companyCode" type="text" required={!cloudMode || registerRole === 'vadovas'} placeholder="300000000" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" />
                </div>
              </div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">PIN kodas parašui</label>
                  <input name="signingPin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" required placeholder="••••" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Pakartokite PIN</label>
                  <input name="confirmSigningPin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" required placeholder="••••" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" />
                </div>
              </div>

              <button type="submit" className="w-full py-3 bg-[#20e090] hover:bg-[#1bc880] text-[#0c4a3b] font-black rounded-xl mt-2 cursor-pointer transition-all shadow-md">
                {cloudMode ? registerRole === 'vadovas' ? 'Tęsti su pasirinktu planu' : 'Sukurti nemokamą paskyrą' : 'Sukurti paskyrą'}
              </button>
              {cloudSignupFeedback && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">{cloudSignupFeedback}</p>}
            </form>
          </div>

        </div>

        <footer className="border-t border-slate-200 py-6 text-center text-[11px] text-slate-400">
          © 2026 DSS Pro. Visos teisės saugomos.
        </footer>

        {cloudMode && <dialog id="signup-confirmation-dialog" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/60">
          {signupSubmitting ? <>
            <div className="flex items-center gap-3"><span className="size-5 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" aria-hidden="true" /><h2 className="text-lg font-bold">Registruojame paskyrą…</h2></div>
            <p className="mt-2 text-sm text-slate-600">Siunčiame patvirtinimo nuorodą adresu <strong className="break-all text-slate-900">{signupConfirmationEmail}</strong>.</p>
            <p className="mt-2 text-xs text-slate-500">Tai gali užtrukti kelias sekundes.</p>
          </> : <>
            <h2 className="text-lg font-bold">Patikrinkite el. paštą</h2>
            <p className="mt-2 text-sm text-slate-600">Patvirtinimo nuorodą išsiuntėme adresu <strong className="break-all text-slate-900">{signupConfirmationEmail}</strong>.</p>
            <p className="mt-2 text-sm text-slate-600">Atidarykite laiške esančią nuorodą, tada prisijunkite. Jei laiško nematote, patikrinkite brukalo aplanką.</p>
            <button type="button" className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => { document.getElementById('signup-confirmation-dialog')?.close(); setCloudSignupFeedback(''); setCurrentPage('app'); setActiveTab('skydelis'); }}>Supratau</button>
          </>}
        </dialog>}

      </div>
    );
  }

  // ==========================================
  // SKYDELIS SU DINAMIŠKAIS MENIU SKIRTUKAIS PAGAL ROLE
  // ==========================================
  if (currentPage === 'app') {
    if (sandboxMode) return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-100 px-4"><p className="text-sm text-slate-600">Įkeliamas izoliuotas demo…</p></main>}><LocalWorkspace
      userRole={userRole}
      sandboxContent={sandboxContent}
      onRoleChange={setUserRole}
      onExit={() => {
        setSandboxMode(false);
        setSandboxContent(null);
        setUserRole('darbuotojas');
        setCurrentPage('landing');
      }}
      sandboxMode
    /></Suspense>;
    if (cloudMode) return <CloudEntry
      onExit={() => setCurrentPage('landing')}
      onBackToLanding={() => {
        setCurrentPage('landing');
        window.setTimeout(scrollToSignup, 0);
      }}
    />;
    return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-100 px-4"><p className="text-sm text-slate-600">Įkeliama darbo sritis…</p></main>}><LocalWorkspace userRole={userRole} onRoleChange={handleRoleChange} onExit={() => setCurrentPage('landing')} /></Suspense>;
  }

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-800">
      
      {/* KAIRIOJI ŠONINĖ JUOSTA (#0c4a3b) */}
      <aside className="w-64 bg-[#0c4a3b] text-white flex flex-col justify-between p-4 shadow-xl select-none">
        <div>
          {/* Logo */}
          <div onClick={() => setCurrentPage('landing')} className="flex items-center gap-2 mb-8 mt-2 px-2 cursor-pointer">
            <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1">
              Dss
              <span className="border border-[#20e090] text-[#20e090] text-xs px-2 py-0.5 rounded-full font-semibold">
                Pro
              </span>
            </span>
          </div>

          {/* Rolės perjungiklis */}
          <div className="mb-6 p-3 bg-white/10 rounded-2xl text-xs space-y-1 border border-white/10">
            <p className="text-emerald-100 font-medium">Demonstracijos rolė:</p>
            <select 
              value={userRole} 
              onChange={(e) => handleRoleChange(e.target.value)}
              className="w-full bg-white text-slate-900 p-2 rounded-xl font-bold focus:outline-none cursor-pointer text-xs"
            >
              <option value="darbuotojas">Darbuotojas (Kursai & AAP)</option>
              <option value="dss">DSS Specialistas (Masinis parašas)</option>
              <option value="vadovas">Įmonės Vadovas (Ataskaitos & PDF)</option>
              <option value="kurejas">Kūrėjas (Šablonų kėlimas)</option>
            </select>
          </div>

          {/* MENIU SKIRTUKAI DINAMIŠKAI PAGAL ROLĘ */}
          <nav className="space-y-1 font-semibold text-xs">
            {/* Skydelis visiems */}
            <button 
              onClick={() => setActiveTab('skydelis')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'skydelis' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
            >
              <Home size={18} className={activeTab === 'skydelis' ? 'text-[#20e090]' : ''} />
              <span>{userRole === 'vadovas' ? 'Būklės pasas' : 'Skydelis'}</span>
            </button>

            {/* DARBUOTOJO SKIRTUKAI */}
            {userRole === 'darbuotojas' && (
              <>
                <button 
                  onClick={() => setActiveTab('biblioteka')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'biblioteka' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <BookOpen size={18} className={activeTab === 'biblioteka' ? 'text-[#20e090]' : ''} />
                  <span>Kursai ir Testai</span>
                </button>
                <button 
                  onClick={() => setActiveTab('aap')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'aap' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <Shirt size={18} className={activeTab === 'aap' ? 'text-[#20e090]' : ''} />
                  <span>Mano AAP Dydžiai</span>
                </button>
                <button 
                  onClick={() => setActiveTab('parasai')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'parasai' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <Key size={18} className={activeTab === 'parasai' ? 'text-[#20e090]' : ''} />
                  <span>Mano Parašai</span>
                </button>
              </>
            )}

            {/* DSS SPECIALISTO SKIRTUKAI */}
            {userRole === 'dss' && (
              <>
                <button 
                  onClick={() => setActiveTab('zurnalai')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'zurnalai' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <FileText size={18} className={activeTab === 'zurnalai' ? 'text-[#20e090]' : ''} />
                  <span>DSS Žurnalai (Masinis)</span>
                </button>
                <button 
                  onClick={() => setActiveTab('komanda')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'komanda' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <Users size={18} className={activeTab === 'komanda' ? 'text-[#20e090]' : ''} />
                  <span>Darbuotojų Sąrašas</span>
                </button>
                <button 
                  onClick={() => setActiveTab('parasai')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'parasai' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <Key size={18} className={activeTab === 'parasai' ? 'text-[#20e090]' : ''} />
                  <span>Mano Parašai</span>
                </button>
              </>
            )}

            {/* ĮMONĖS VADOVO SKIRTUKAI */}
            {userRole === 'vadovas' && (
              <>
                <button 
                  onClick={() => setActiveTab('ataskaitos')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'ataskaitos' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <FileBarChart size={18} className={activeTab === 'ataskaitos' ? 'text-[#20e090]' : ''} />
                  <span>Ataskaitos VDI (PDF)</span>
                </button>
                <button 
                  onClick={() => setActiveTab('komanda')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'komanda' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <Users size={18} className={activeTab === 'komanda' ? 'text-[#20e090]' : ''} />
                  <span>Komanda</span>
                </button>
                <button 
                  onClick={() => setActiveTab('prenumerata')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'prenumerata' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <CreditCard size={18} className={activeTab === 'prenumerata' ? 'text-[#20e090]' : ''} />
                  <span>Prenumerata</span>
                </button>
              </>
            )}

            {/* KŪRĖJO SKIRTUKAI */}
            {userRole === 'kurejas' && (
              <>
                <button 
                  onClick={() => setActiveTab('kurejas_sablonai')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'kurejas_sablonai' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <Upload size={18} className={activeTab === 'kurejas_sablonai' ? 'text-[#20e090]' : ''} />
                  <span>Šablonų Kėlimas</span>
                </button>
                <button 
                  onClick={() => setActiveTab('biblioteka')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'biblioteka' ? 'bg-white/10 text-white font-bold shadow-xs' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'}`}
                >
                  <BookOpen size={18} className={activeTab === 'biblioteka' ? 'text-[#20e090]' : ''} />
                  <span>Biblioteka</span>
                </button>
              </>
            )}

          </nav>
        </div>

        <div className="pt-4 border-t border-white/10 flex items-center justify-between px-2 text-xs text-emerald-100/70">
          <span className="capitalize font-semibold">Rolė: {userRole}</span>
          <button onClick={() => setCurrentPage('landing')} title="Išeiti" className="hover:text-white cursor-pointer flex items-center gap-1">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* DEŠINĖ DALIS */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-3.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="text-slate-800 cursor-pointer" onClick={() => setCurrentPage('landing')}>DssPro</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-500 capitalize">{userRole}</span>
            <span className="text-slate-300">&gt;</span>
            <span className="text-[#0c4a3b] font-bold capitalize">{activeTab}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-[#0c4a3b] flex items-center justify-center font-bold text-xs">
              JP
            </div>
            <span className="text-xs font-bold text-slate-800">Jonas Petraitis</span>
          </div>
        </header>

        <main className="p-8 max-w-6xl w-full mx-auto">
          
          {/* TAB 1: SKYDELIS (Pritaikytas kiekvienai rolei) */}
          {activeTab === 'skydelis' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-800">Sveiki sugrįžę, Jonas Petraitis!</h1>
                  <p className="text-xs text-slate-500 mt-1">Aktyvus skydelis: <strong className="text-[#0c4a3b] capitalize">{userRole}</strong>.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <p className="text-xs text-slate-400 font-semibold mb-1">Aktyvūs kursai</p>
                  <p className="text-2xl font-black text-slate-800">{courses.length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <p className="text-xs text-slate-400 font-semibold mb-1">Pasirašyti žurnalai</p>
                  <p className="text-2xl font-black text-[#1bc880]">{dssDocuments.filter(d => d.signed).length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <p className="text-xs text-slate-400 font-semibold mb-1">VDI Atitiktis</p>
                  <p className="text-2xl font-black text-slate-800">100% ✓</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: BIBLIOTEKA / KURSAI (Darbuotojui ir Kūrėjui) */}
          {activeTab === 'biblioteka' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-6 border-b border-slate-200 text-xs font-bold">
                  <button onClick={() => setCourseFilter('visi')} className={`pb-3 border-b-2 transition-all cursor-pointer ${courseFilter === 'visi' ? 'border-[#0c4a3b] text-slate-900 font-black' : 'border-transparent text-slate-400'}`}>
                    Visi kursai ({courses.length})
                  </button>
                  <button onClick={() => setCourseFilter('mano')} className={`pb-3 border-b-2 transition-all cursor-pointer ${courseFilter === 'mano' ? 'border-[#0c4a3b] text-slate-900 font-black' : 'border-transparent text-slate-400'}`}>
                    Priskirti / Vykdomi
                  </button>
                  <button onClick={() => setCourseFilter('baigti')} className={`pb-3 border-b-2 transition-all cursor-pointer ${courseFilter === 'baigti' ? 'border-[#0c4a3b] text-slate-900 font-black' : 'border-transparent text-slate-400'}`}>
                    Baigti kursai
                  </button>
                </div>

                <div className="relative w-64">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Ieškoti kurso..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0c4a3b]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {filteredCourses.map((course) => (
                  <div key={course.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
                    <div>
                      <img src={course.img} alt={course.title} className="w-full h-36 object-cover" />
                      <div className="p-4">
                        <p className="text-[10px] text-slate-400 mb-1">{course.category} • {course.time}</p>
                        <h3 className="font-bold text-slate-800 text-xs line-clamp-2">{course.title}</h3>
                      </div>
                    </div>
                    <div className="p-4 pt-0 flex items-center justify-between border-t border-slate-100 mt-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        course.status === 'Baigtas' ? 'bg-emerald-100 text-emerald-800' :
                        course.status === 'Vykdomas' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {course.status}
                      </span>
                      <button 
                        onClick={() => { setSelectedCourseForTest(course); setShowTestModal(true); }} 
                        className="text-xs font-bold text-[#0c4a3b] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        Spręsti <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: ATASKAITOS VDI (Vadovui) */}
          {activeTab === 'ataskaitos' && (
            <div className="space-y-6">
              <h1 className="text-xl font-bold text-slate-800">Įmonės Darbuotojų Ataskaitos VDI</h1>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden text-xs shadow-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Darbuotojas</th>
                      <th className="p-3">AAP Kortelė</th>
                      <th className="p-3">Testas</th>
                      <th className="p-3 text-right">PDF Ataskaita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employeesReport.map(e => (
                      <tr key={e.id}>
                        <td className="p-3 font-semibold">{e.name}</td>
                        <td className="p-3">{e.aapSigned ? <span className="text-emerald-600 font-bold">✓ Pasirašyta PIN kodu</span> : <span className="text-rose-500">Nepasirašyta</span>}</td>
                        <td className="p-3 font-bold">{e.testScore}%</td>
                        <td className="p-3 text-right">
                          <button onClick={() => alert(`Atsisiunčiamas PDF darbuotojui ${e.name}`)} className="px-3 py-1 bg-[#0c4a3b] text-white rounded-lg text-xs font-bold cursor-pointer">
                            ATSISIŪSTI PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: KOMANDA (Vadovui ir DSS) */}
          {activeTab === 'komanda' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-800">Įmonės Komanda</h1>
                  <p className="text-xs text-slate-500">Priskirti darbuotojai ir jų saugos statusas.</p>
                </div>
                <button onClick={() => {
                  const name = prompt("Įveskite naujo darbuotojo vardą ir pavardę:");
                  if (name) {
                    setTeamMembers([...teamMembers, { id: Date.now(), name, role: 'Darbuotojas', status: 'Laukia instruktavimo', email: `${name.toLowerCase().replace(' ', '')}@imone.lt` }]);
                  }
                }} className="px-4 py-2 bg-[#0c4a3b] text-white rounded-xl text-xs font-bold cursor-pointer">
                  + Pridėti darbuotoją
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden text-xs shadow-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Vardas Pavardė</th>
                      <th className="p-3">Pareigos</th>
                      <th className="p-3">El. paštas</th>
                      <th className="p-3 text-right">Statusas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamMembers.map(m => (
                      <tr key={m.id}>
                        <td className="p-3 font-semibold text-slate-800">{m.name}</td>
                        <td className="p-3 text-slate-600">{m.role}</td>
                        <td className="p-3 text-slate-400">{m.email}</td>
                        <td className="p-3 text-right">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status === 'Aktyvus' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: DSS ŽURNALAI (DSS Specialistui) */}
          {activeTab === 'zurnalai' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-800">DSS Žurnalai ir Masinis Pasirašymas</h1>
                  <p className="text-xs text-slate-500">Pasirašykite visus dokumentus vienu PIN kodu.</p>
                </div>
                <button 
                  disabled={selectedDocsCount === 0} 
                  onClick={() => setShowBulkPinModal(true)} 
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${selectedDocsCount > 0 ? 'bg-[#0c4a3b] text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                  Pasirašyti pasirinktus ({selectedDocsCount}) su PIN
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden text-xs shadow-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <button onClick={handleToggleSelectAll} className="cursor-pointer">
                          {selectAll ? <CheckSquare size={16} className="text-[#0c4a3b]" /> : <Square size={16} />}
                        </button>
                      </th>
                      <th className="p-3">Įmonė</th>
                      <th className="p-3">Dokumentas</th>
                      <th className="p-3">Darbuotojas</th>
                      <th className="p-3 text-right">Statusas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dssDocuments.map((doc) => (
                      <tr key={doc.id}>
                        <td className="p-3 text-center">
                          <button onClick={() => handleToggleSelect(doc.id)} className="cursor-pointer text-slate-400">
                            {doc.selected ? <CheckSquare size={16} className="text-[#0c4a3b]" /> : <Square size={16} />}
                          </button>
                        </td>
                        <td className="p-3 font-semibold">{doc.company}</td>
                        <td className="p-3">{doc.docName}</td>
                        <td className="p-3 text-slate-500">{doc.worker}</td>
                        <td className="p-3 text-right">
                          {doc.signed ? (
                            <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">Pasirašyta PIN kodu ✓</span>
                          ) : (
                            <span className="bg-amber-50 text-amber-600 px-2.5 py-0.5 rounded-full text-[10px] font-bold">Laukia parašo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: MANO AAP DYDŽIAI (Darbuotojui) */}
          {activeTab === 'aap' && (
            <div className="max-w-xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h1 className="text-lg font-bold text-slate-800">Mano AAP Dydžiai IR Kortelė</h1>
                <button onClick={() => setShowPinModal(true)} className="px-3 py-1.5 bg-[#0c4a3b] text-white rounded-xl text-xs font-bold cursor-pointer">
                  Patvirtinti PIN Kodu
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Batų dydis</label>
                  <input type="text" value={sizes.shoes} onChange={(e) => setSizes({...sizes, shoes: e.target.value})} className="w-full p-2 border border-slate-200 rounded-xl font-bold text-slate-800" />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Drabužių dydis</label>
                  <input type="text" value={sizes.clothing} onChange={(e) => setSizes({...sizes, clothing: e.target.value})} className="w-full p-2 border border-slate-200 rounded-xl font-bold text-slate-800" />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Kelnių dydis</label>
                  <input type="text" value={sizes.pants} onChange={(e) => setSizes({...sizes, pants: e.target.value})} className="w-full p-2 border border-slate-200 rounded-xl font-bold text-slate-800" />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Ūgis (cm)</label>
                  <input type="text" value={sizes.height} onChange={(e) => setSizes({...sizes, height: e.target.value})} className="w-full p-2 border border-slate-200 rounded-xl font-bold text-slate-800" />
                </div>
              </div>
            </div>
          )}

          {/* TAB: MANO PARAŠAI */}
          {activeTab === 'parasai' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h1 className="text-lg font-bold text-slate-800">Mano Pasirašyti Dokumentai</h1>
              <p className="text-xs text-slate-500">Skaitmeniniai parašai, užfiksuoti pagal VDI reikalavimus.</p>
              
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-800">Įvadinio instruktavimo žurnalas</p>
                    <p className="text-[10px] text-slate-400">Pasirašyta PIN kodu · IP: 192.168.1.45</p>
                  </div>
                  <span className="text-[#1bc880] font-bold">2026-10-12 ✓</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PRENUMERATA (Vadovui) */}
          {activeTab === 'prenumerata' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 max-w-lg">
              <h1 className="text-lg font-bold text-slate-800">Įmonės Prenumerata</h1>
              <div className="p-4 bg-emerald-50 rounded-xl text-xs space-y-1">
                <p className="font-bold text-[#0c4a3b]">Aktyvus planas: Pro (79 € / mėn.)</p>
                <p className="text-slate-600">Būsena: Aktyvi iki 2026-11-12</p>
              </div>
            </div>
          )}

          {/* TAB: ŠABLONŲ KĖLIMAS (Kūrėjui) */}
          {activeTab === 'kurejas_sablonai' && (
            <div>
              <h1 className="text-xl font-bold text-slate-800 mb-4">Naujų Šablonų Kėlimas</h1>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (!newTemplateTitle) return;
                setCourses([{ id: Date.now(), title: newTemplateTitle, category: "Mokymai", type: "Mokymai", time: "20min", status: "Neatliktas", img: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500" }, ...courses]);
                setNewTemplateTitle('');
                alert("Šablonas sėkmingai pridėtas į bendrą biblioteką!");
              }} className="bg-white p-6 rounded-2xl border border-slate-200 max-w-md space-y-3 text-xs">
                <label className="block font-semibold text-slate-700">Šablono / Kurso pavadinimas</label>
                <input type="text" required placeholder="Pvz.: Saugus darbas su chemija" value={newTemplateTitle} onChange={(e) => setNewTemplateTitle(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl" />
                <button type="submit" className="w-full py-2.5 bg-[#0c4a3b] text-white font-bold rounded-xl cursor-pointer">Įkelti į Biblioteką</button>
              </form>
            </div>
          )}

        </main>
      </div>

      {/* MODALAI */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl text-center">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Įveskite PIN kodą</h3>
            <p className="text-xs text-slate-500 mb-4">AAP kortelės ir dydžių patvirtinimui.</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (pinCode.length < 4) return alert("Įveskite 4 skaitmenų PIN kodą!");
              alert("Dydžiai sėkmingai išsaugoti ir patvirtinti!");
              setShowPinModal(false);
              setPinCode('');
            }}>
              <input type="password" maxLength={4} required placeholder="••••" value={pinCode} onChange={(e) => setPinCode(e.target.value)} className="w-32 mx-auto text-center tracking-widest text-xl py-2 border border-slate-300 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-[#0c4a3b]" />
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => setShowPinModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer">Atšaukti</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold bg-[#0c4a3b] text-white rounded-xl cursor-pointer">Patvirtinti</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkPinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl text-center">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Masinis Pasirašymas</h3>
            <p className="text-xs text-slate-500 mb-4">Pasirašote <strong>{selectedDocsCount}</strong> dokumentus PIN kodu.</p>
            <form onSubmit={handleBulkSign}>
              <input type="password" maxLength={4} required placeholder="••••" value={pinCode} onChange={(e) => setPinCode(e.target.value)} className="w-32 mx-auto text-center tracking-widest text-xl py-2 border border-slate-300 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-[#0c4a3b]" />
              <div className="flex justify-center gap-2">
                <button type="button" onClick={() => setShowBulkPinModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer">Atšaukti</button>
                <button type="submit" className="px-4 py-2 text-xs font-bold bg-[#0c4a3b] text-white rounded-xl cursor-pointer">Patvirtinti</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Žinių patikrinimo testas</h3>
            <p className="text-xs text-slate-500 mb-4">{selectedCourseForTest ? selectedCourseForTest.title : "Testas"}</p>

            {testStep === 'quiz' ? (
              <form onSubmit={handleCalculateTest} className="space-y-4 text-sm">
                <div>
                  <p className="font-semibold text-slate-700 mb-2">1. Ką daryti kilus gaisrui patalpoje?</p>
                  <label className="block text-xs mb-1"><input type="radio" name="q1" value="wrong" onChange={(e) => setQuizAnswers({...quizAnswers, q1: e.target.value})} /> Gesinti bet kokia kaina</label>
                  <label className="block text-xs"><input type="radio" name="q1" value="correct" onChange={(e) => setQuizAnswers({...quizAnswers, q1: e.target.value})} /> Skambinti 112 ir palikti patalpą</label>
                </div>
                <div>
                  <p className="font-semibold text-slate-700 mb-2">2. Kur yra pagrindinis gesintuvas?</p>
                  <label className="block text-xs mb-1"><input type="radio" name="q2" value="correct" onChange={(e) => setQuizAnswers({...quizAnswers, q2: e.target.value})} /> Prie pagrindinio įėjimo</label>
                  <label className="block text-xs"><input type="radio" name="q2" value="wrong" onChange={(e) => setQuizAnswers({...quizAnswers, q2: e.target.value})} /> Rūsyje užrakintas</label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowTestModal(false)} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer">Atšaukti</button>
                  <button type="submit" className="px-4 py-2 text-xs font-bold bg-[#0c4a3b] text-white rounded-xl cursor-pointer">Pateikti</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleWorkerSignTest} className="space-y-4 text-center">
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl font-bold text-sm">
                  Testas išlaikytas! Rezultatas: {testScore}%
                </div>
                <p className="text-xs text-slate-500">Įveskite PIN kodą žurnalo pasirašymui:</p>
                <input type="password" maxLength={4} required placeholder="••••" value={pinCode} onChange={(e) => setPinCode(e.target.value)} className="w-32 mx-auto text-center tracking-widest text-xl py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0c4a3b]" />
                <div className="flex justify-center gap-2">
                  <button type="button" onClick={() => { setShowTestModal(false); setTestStep('quiz'); }} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer">Uždaryti</button>
                  <button type="submit" className="px-4 py-2 text-xs font-bold bg-[#0c4a3b] text-white rounded-xl cursor-pointer">Pasirašyti</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}