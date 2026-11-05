import { lazy, Suspense, useEffect, useState } from 'react';
import CloudEntry from './CloudEntry.jsx';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';
import { 
  Home, 
  BookOpen, 
  Users, 
  Upload, 
  Shirt, 
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
  FileBarChart,
  BellRing
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
  const [registerPlan, setRegisterPlan] = useState('up_to_20');
  const [subscriptionPlans, setSubscriptionPlans] = useState([
    { code: 'up_to_20', name: 'Iki 20 darbuotojų', amount_cents: 2999, employee_limit: 20 },
    { code: 'up_to_50', name: 'Iki 50 darbuotojų', amount_cents: 4999, employee_limit: 50 },
    { code: 'up_to_75', name: 'Iki 75 darbuotojų', amount_cents: 5999, employee_limit: 75 },
    { code: 'up_to_200', name: 'Iki 200 darbuotojų', amount_cents: 12999, employee_limit: 200 },
  ]);
  const [subscriptionPlansError, setSubscriptionPlansError] = useState('');
  const [cloudSignupFeedback, setCloudSignupFeedback] = useState('');
  const [signupConfirmationEmail, setSignupConfirmationEmail] = useState('');
  const [signupSubmitting, setSignupSubmitting] = useState(false);

  useEffect(() => {
    if (!cloudMode) return undefined;
    let active = true;
    supabase.from('subscription_plans')
      .select('code, name, amount_cents, employee_limit')
      .eq('active', true)
      .in('code', ['up_to_20', 'up_to_50', 'up_to_75', 'up_to_200'])
      .order('employee_limit')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setSubscriptionPlansError(`Kainoraščio įkelti nepavyko: ${error.message}`);
          return;
        }
        if (data?.length === 4) {
          setSubscriptionPlans(data);
          setSubscriptionPlansError('');
        }
      })
      .catch((error) => {
        if (active) setSubscriptionPlansError(`Kainoraščio įkelti nepavyko: ${error.message || 'ryšio klaida.'}`);
      });
    return () => { active = false; };
  }, [cloudMode]);

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
      <div className="min-h-screen bg-white font-sans text-slate-800">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
            <a href="#top" className="flex items-center gap-2" aria-label="DSS Pro pradžia">
              <span className="text-xl font-black tracking-tight text-[#0c4a3b]">DSS<span className="ml-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-sm font-bold text-emerald-800">Pro</span></span>
            </a>
            <nav aria-label="Pagrindinė navigacija" className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
              <a className="transition hover:text-emerald-800" href="#how-it-works">Kaip veikia</a>
              <a className="transition hover:text-emerald-800" href="#features">Galimybės</a>
              <a className="transition hover:text-emerald-800" href="#pricing-signup">Kainos</a>
            </nav>
            <button
              onClick={() => { setCurrentPage('app'); setActiveTab('skydelis'); }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-700 hover:text-emerald-800"
            >
              Prisijungti
            </button>
          </div>
        </header>

        <main id="top">
          <section className="overflow-hidden bg-[#f2f8f5]">
            <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24">
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900">
                  <Sparkles size={14} className="text-emerald-700" /> Darbuotojų saugos procesai vienoje sistemoje
                </div>
                <h1 className="max-w-2xl text-4xl font-black leading-[1.12] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                  Darbuotojų sauga – nuo instruktažo iki pasirašyto žurnalo.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                  Pakvieskite darbuotojus, priskirkite jiems instruktažus ir testus, stebėkite atlikimo būsenas ir tvarkykite DSS dokumentus vienoje vietoje.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button onClick={scrollToSignup} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0c4a3b] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/10 transition hover:bg-emerald-900">
                    Peržiūrėti planus <ChevronRight size={17} />
                  </button>
                  <button onClick={startSandbox} disabled={sandboxStarting} className="rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-700 hover:text-emerald-900 disabled:cursor-wait disabled:opacity-70">
                    {sandboxStarting ? 'Ruošiama demo aplinka…' : 'Išbandyti be registracijos'}
                  </button>
                </div>
                {sandboxStartError && <p role="alert" className="mt-4 max-w-md text-sm text-rose-700">{sandboxStartError}</p>}
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2"><Check size={16} className="text-emerald-700" /> Darbuotojai prisijungia kvietimu</span>
                  <span className="inline-flex items-center gap-2"><Check size={16} className="text-emerald-700" /> Dokumentai eksportuojami į PDF</span>
                </div>
              </div>

              <div className="relative mx-auto w-full max-w-xl">
                <div className="absolute -inset-5 rounded-[2rem] bg-emerald-200/50 blur-2xl" aria-hidden="true" />
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-emerald-950/10">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-400">ĮMONĖS DARBO VIETA</p>
                      <p className="mt-1 font-bold text-slate-900">UAB „Pavyzdys“</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Vadovo aplinka</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-5">
                    <div className="rounded-xl border border-slate-100 bg-white p-4">
                      <p className="text-xs text-slate-500">Darbuotojai</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900">24</p>
                      <p className="mt-1 text-xs text-slate-500">Įmonės komanda</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white p-4">
                      <p className="text-xs text-slate-500">Laukia atlikimo</p>
                      <p className="mt-2 text-2xl font-bold text-amber-600">3</p>
                      <p className="mt-1 text-xs text-slate-500">Užduotys ir parašai</p>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">Naujausios užduotys</p>
                      <span className="text-xs font-medium text-slate-500">Šiandien</span>
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: 'Priešgaisrinės saugos instruktažas', status: 'Atlikta', done: true },
                        { name: 'Darbas aukštyje: žinių patikrinimas', status: 'Laukia', done: false },
                        { name: 'Darbuotojo AAP kortelė', status: 'Atnaujinta', done: true },
                      ].map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3">
                          <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-slate-700">
                            <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${item.done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {item.done ? <Check size={15} /> : <FileText size={15} />}
                            </span>
                            <span className="truncate">{item.name}</span>
                          </span>
                          <span className={`shrink-0 text-xs font-semibold ${item.done ? 'text-emerald-700' : 'text-amber-700'}`}>{item.status}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-right text-[11px] text-slate-400">Demonstracinis vaizdas</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="how-it-works" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Paprasta pradėti</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Aiškus procesas visai komandai</h2>
                <p className="mt-4 leading-7 text-slate-600">Vadovui — matomumas ir tvarka. Darbuotojui — aiškios užduotys ir patogus pasirašymas.</p>
              </div>
              <div className="mt-12 grid gap-5 md:grid-cols-4">
                {[
                  ['01', 'Sukurkite įmonę', 'Pasirinkite planą ir susikurkite įmonės darbo vietą.'],
                  ['02', 'Pakvieskite komandą', 'Pridėkite darbuotojus ir suteikite jiems prieigą.'],
                  ['03', 'Priskirkite užduotis', 'Parinkite reikalingus instruktažus, testus ir dokumentus.'],
                  ['04', 'Stebėkite eigą', 'Matykite atlikimo būsenas, parašus ir paruoštus dokumentus.'],
                ].map(([number, title, description]) => (
                  <article key={number} className="rounded-2xl border border-slate-200 bg-white p-6">
                    <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800">{number}</span>
                    <h3 className="mt-5 font-bold text-slate-900">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="features" className="scroll-mt-24 bg-slate-50 px-5 py-16 sm:px-8 sm:py-20">
            <div className="mx-auto max-w-7xl">
              <div className="max-w-2xl">
                <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">DSS Pro galimybės</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Kasdieniai saugos procesai vienoje vietoje</h2>
              </div>
              <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: BookOpen, title: 'Žurnalai ir parašai', text: 'Tvarkykite instruktažų žurnalus ir rinkite dalyvių parašus PIN kodu.' },
                  { icon: Award, title: 'Instruktažai ir testai', text: 'Priskirkite darbuotojams mokymų medžiagą bei žinių patikrinimus.' },
                  { icon: Shirt, title: 'Darbuotojų kortelės', text: 'Vienoje vietoje peržiūrėkite darbuotojo duomenis ir AAP dydžius.' },
                  { icon: FileBarChart, title: 'Būsenos ir dokumentai', text: 'Stebėkite užduočių eigą, peržiūrėkite įrašus ir atsisiųskite PDF.' },
                ].map(({ icon: Icon, title, text }) => (
                  <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Icon size={21} /></span>
                    <h3 className="mt-5 font-bold text-slate-900">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                  </article>
                ))}
              </div>
              <div className="mt-6 grid gap-5 rounded-2xl bg-[#0c4a3b] p-6 text-white sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
                <div>
                  <p className="text-sm font-bold text-emerald-200">Dirbate keliose įmonėse?</p>
                  <h3 className="mt-2 text-xl font-bold">Viena darbuotojo paskyra — prieiga prie kelių įmonių</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">Darbuotojas gali priimti kvietimus iš skirtingų įmonių tuo pačiu el. paštu ir pasirinkti, kurios įmonės darbo vietoje dirba.</p>
                </div>
                <Users size={34} className="hidden text-emerald-200 sm:block" aria-hidden="true" />
              </div>
              <div className="mt-5 grid gap-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:grid-cols-[auto_1fr] sm:items-start sm:p-8">
                <span className="grid size-12 place-items-center rounded-xl bg-white text-emerald-800 shadow-sm"><BellRing size={22} /></span>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Svarbūs terminai — matomi laiku</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950">Pranešimas apie artėjantį medicininio pažymėjimo galiojimo pabaigos terminą</h3>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">Vadovo aplinkoje rodomas sistemos pranešimas likus 14 dienų iki darbuotojo medicininio pažymėjimo galiojimo pabaigos. Taip pat galite stebėti pasibaigusius terminus ir periodinių instruktavimų bei parašų būsenas.</p>
                </div>
              </div>
            </div>
          </section>

        {/* KAINOS IR REGISTRACIJA */}
        <section id="pricing-signup" className="mx-auto grid max-w-7xl scroll-mt-24 grid-cols-1 items-start gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12">
          <div className="lg:col-span-6 space-y-6">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Aiškūs planai</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Pasirinkite komandai tinkamą planą</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Moka tik įmonės vadovas. DSS specialistams ir darbuotojams sistema nemokama.
              </p>
            </div>

            {subscriptionPlansError && <p role="alert" className="text-xs text-rose-700">{subscriptionPlansError}</p>}
            <div className="space-y-3">
              {subscriptionPlans.map((plan) => (
                <button key={plan.code} type="button" aria-pressed={registerRole === 'vadovas' && registerPlan === plan.code} onClick={() => { setRegisterRole('vadovas'); setRegisterPlan(plan.code); }} className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors sm:px-5 ${registerRole === 'vadovas' && registerPlan === plan.code ? 'border-emerald-700 bg-emerald-50/70 ring-1 ring-emerald-700' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${registerRole === 'vadovas' && registerPlan === plan.code ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-transparent'}`}><Check size={13} strokeWidth={3} /></span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{plan.name}</span>
                      <span className="mt-1 block text-xs text-slate-500">DSS žurnalų ir dokumentų valdymas <span className="px-1 text-slate-300">·</span> PDF eksportas</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block whitespace-nowrap text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{new Intl.NumberFormat('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(plan.amount_cents / 100)} €</span>
                    <span className="block text-xs text-slate-500">per mėnesį</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-900/5 sm:p-8">
            <h3 className="text-xl font-bold text-slate-950">Pradėkite nuo paskyros</h3>
            <p className="mb-5 mt-2 text-sm leading-6 text-slate-600">Vadovo paskyrai reikia mokamo plano. DSS specialistas gali susikurti nemokamą paskyrą, o darbuotojai prisijungia vadovo kvietimu.</p>

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
                ? `Pasirinktas ${subscriptionPlans.find((plan) => plan.code === registerPlan)?.name ?? 'planas'}. Sukurkite paskyrą ir patvirtinkite el. paštą; tada galėsite sukurti įmonę ir užsakyti prenumeratą.`
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

              {!cloudMode && <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Įmonės pavadinimas</label>
                  <input name="companyName" type="text" required placeholder="UAB Įmonė" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Įmonės kodas</label>
                  <input name="companyCode" type="text" required placeholder="300000000" className="w-full p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1bc880]" />
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

        </section>

        <section className="border-t border-slate-200 bg-white px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-2xl font-bold text-slate-950">Dažniausiai užduodami klausimai</h2>
            <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">Kas apmoka DSS Pro planą?<ChevronRight size={18} className="shrink-0 text-emerald-800 transition group-open:rotate-90" /></summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Mokamą planą pasirenka ir apmoka įmonės vadovas. DSS specialistai ir darbuotojai prie įmonės prisijungia nemokamai.</p>
              </details>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">Ar galiu išbandyti sistemą prieš registruodamasis?<ChevronRight size={18} className="shrink-0 text-emerald-800 transition group-open:rotate-90" /></summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Taip. Paspauskite „Išbandyti be registracijos“ ir peržiūrėkite demonstracinę aplinką.</p>
              </details>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">Ar DSS Pro galiu naudoti vietoje popierinių žurnalų?<ChevronRight size={18} className="shrink-0 text-emerald-800 transition group-open:rotate-90" /></summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">DSS Pro leidžia pildyti žurnalus elektroniniu būdu, rinkti PIN parašus ir atsisiųsti dokumentus PDF formatu. Įmonės dokumentų archyvas pasiekiamas galiojant prenumeratai, o jai pasibaigus dar 2 mėnesius lieka tik peržiūros prieiga. Ar konkrečiam dokumentui pakanka elektroninio formato, priklauso nuo jam taikomų teisės aktų reikalavimų.</p>
              </details>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-900">Ar darbuotojas gali būti pakviestas į kelias įmones?<ChevronRight size={18} className="shrink-0 text-emerald-800 transition group-open:rotate-90" /></summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Taip. Darbuotojas gali naudoti tą pačią paskyrą kelių įmonių kvietimams ir pasirinkti, kurios įmonės darbo vietoje dirba.</p>
              </details>
            </div>
          </div>
        </section>
        </main>

        <footer className="border-t border-slate-200 bg-slate-50 py-6 text-center text-xs text-slate-500">
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
                <p className="font-bold text-[#0c4a3b]">Aktyvus planas: iki 20 darbuotojų (29,99 € / mėn.)</p>
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