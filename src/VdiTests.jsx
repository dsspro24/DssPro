import { useEffect, useMemo, useState } from 'react';
import darbdaviuiQuestions from './data/vdi-tests/darbdaviui.json';
import grupeIQuestions from './data/vdi-tests/grupe-i.json';
import grupeIIQuestions from './data/vdi-tests/grupe-ii.json';
import grupeIIIQuestions from './data/vdi-tests/grupe-iii.json';

const CATEGORIES = [
  { id: 'darbdavys', title: 'Darbdaviui atstovaujantis asmuo', description: 'Vadovams ir asmenims, kuriems pavesta atlikti DSS specialisto funkcijas.', questions: darbdaviuiQuestions },
  { id: 'grupe-i', title: 'DSS specialistas – I grupė', description: 'Ekonominių veiklos rūšių I grupės klausimai.', questions: grupeIQuestions },
  { id: 'grupe-ii', title: 'DSS specialistas – II grupė', description: 'Ekonominių veiklos rūšių II grupės klausimai.', questions: grupeIIQuestions },
  { id: 'grupe-iii', title: 'DSS specialistas – III grupė', description: 'Ekonominių veiklos rūšių III grupės klausimai.', questions: grupeIIIQuestions },
];

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isCorrect(question, answer) {
  const correctIndexes = Array.isArray(question.correctIndexes)
    ? question.correctIndexes
    : [question.correctIndex];
  return Array.isArray(answer)
    ? answer.length === correctIndexes.length && answer.every((index) => correctIndexes.includes(index))
    : correctIndexes.includes(answer);
}

export default function VdiTests() {
  const [categoryId, setCategoryId] = useState('');
  const [mode, setMode] = useState('');
  const [questionCount, setQuestionCount] = useState(20);
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(20 * 60);
  const [finished, setFinished] = useState(false);

  const category = CATEGORIES.find((item) => item.id === categoryId);

  useEffect(() => {
    document.title = 'VDI testai | DSS Pro';
    return () => { document.title = 'DSS Pro'; };
  }, []);

  useEffect(() => {
    if (mode !== 'exam' || finished) return undefined;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setFinished(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode, finished]);

  const reset = () => {
    setCategoryId('');
    setMode('');
    setQuestions([]);
    setAnswers({});
    setSelectedAnswer(null);
    setQuestionIndex(0);
    setFinished(false);
  };

  const startTest = () => {
    if (!category) return;
    const count = mode === 'exam' ? Math.min(questionCount, category.questions.length) : category.questions.length;
    setQuestions(shuffle(category.questions).slice(0, count));
    setAnswers({});
    setSelectedAnswer(null);
    setQuestionIndex(0);
    setSecondsLeft(Math.max(5, count) * 60);
    setFinished(false);
  };

  const chooseAnswer = (index) => {
    if (mode === 'learning' && selectedAnswer !== null) return;
    setSelectedAnswer(index);
    setAnswers((current) => ({ ...current, [questions[questionIndex].id]: index }));
  };

  const nextQuestion = () => {
    setSelectedAnswer(answers[questions[questionIndex + 1]?.id] ?? null);
    setQuestionIndex((current) => current + 1);
  };

  const result = useMemo(() => {
    const correct = questions.reduce((sum, question) => sum + (isCorrect(question, answers[question.id]) ? 1 : 0), 0);
    return { correct, total: questions.length, percent: questions.length ? Math.round((correct / questions.length) * 100) : 0 };
  }, [questions, answers]);

  const formattedTime = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-[#f7faf8] font-sans text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2" aria-label="DSS Pro pradžia">
            <span className="text-xl font-black tracking-tight text-[#0c4a3b]">DSS<span className="ml-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-sm font-bold text-emerald-800">Pro</span></span>
          </a>
          <nav aria-label="Pagrindinė navigacija" className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a className="hover:text-emerald-800" href="/#kaip-veikia">Kaip veikia</a>
            <a className="hover:text-emerald-800" href="/#galimybes">Galimybės</a>
            <a className="hover:text-emerald-800" href="/#kainos">Kainos</a>
            <a className="font-semibold text-emerald-900" href="/vdi-testai" aria-current="page">VDI testai</a>
          </nav>
          <a href="/" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-700 hover:text-emerald-800">DSS Pro</a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Savarankiškas pasiruošimas</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">VDI testai</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Pasirinkite pasiruošimo kryptį ir išbandykite žinias. Klausimai ir testų logika vykdoma tiesiai jūsų naršyklėje – nė vienas atsakymas neperduodamas į duomenų bazę.
          </p>
        </div>

        {!categoryId ? (
          <section>
            <h2 className="mb-4 text-xl font-bold text-slate-950">Kam ruošiatės?</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {CATEGORIES.map((item) => (
                <button key={item.id} type="button" onClick={() => setCategoryId(item.id)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                  <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-sm font-black text-emerald-800">{item.id === 'darbdavys' ? 'D' : item.id.slice(-1).toUpperCase()}</span>
                  <h3 className="font-bold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                  <span className="mt-4 block text-sm font-bold text-emerald-800">{item.questions.length} klausimų banke →</span>
                </button>
              ))}
            </div>
          </section>
        ) : !mode ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <button type="button" onClick={() => setCategoryId('')} className="mb-5 text-sm font-semibold text-slate-500 hover:text-emerald-800">← Keisti kategoriją</button>
            <h2 className="text-xl font-bold text-slate-950">{category.title}</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <button type="button" onClick={() => setMode('learning')} className="rounded-xl border border-slate-200 p-5 text-left hover:border-emerald-400 hover:bg-emerald-50/40">
                <h3 className="font-bold text-slate-950">Mokymosi režimas</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Pasirinkus atsakymą iškart matysite rezultatą ir paaiškinimą.</p>
              </button>
              <button type="button" onClick={() => setMode('exam')} className="rounded-xl border border-slate-200 p-5 text-left hover:border-emerald-400 hover:bg-emerald-50/40">
                <h3 className="font-bold text-slate-950">Egzamino simuliacija</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Atsitiktiniai klausimai, laikmatis ir galutinis rezultatų sąrašas.</p>
              </button>
            </div>
          </section>
        ) : questions.length === 0 && !finished ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <button type="button" onClick={() => setMode('')} className="mb-5 text-sm font-semibold text-slate-500 hover:text-emerald-800">← Keisti režimą</button>
            {mode === 'exam' ? (
              <div className="mb-6">
                <label htmlFor="question-count" className="block text-sm font-bold text-slate-950">Klausimų skaičius</label>
                <select id="question-count" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm sm:max-w-xs">
                  <option value={20} disabled={category.questions.length < 20}>20 klausimų</option>
                  <option value={30} disabled={category.questions.length < 30}>30 klausimų</option>
                  <option value={category.questions.length}>Visi turimi ({category.questions.length})</option>
                </select>
              </div>
            ) : <p className="mb-6 text-sm text-slate-600">Mokymuisi bus parodyti visi turimi šios kategorijos klausimai.</p>}
            <button type="button" onClick={startTest} className="rounded-xl bg-[#0c4a3b] px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-900">Pradėti testą</button>
          </section>
        ) : finished ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <p className="text-sm font-bold text-emerald-700">Testas baigtas</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">{result.percent}%</h2>
            <p className="mt-2 text-slate-600">Teisingai atsakyta į <strong className="text-slate-950">{result.correct} iš {result.total}</strong> klausimų.</p>
            <div className="mt-7 rounded-xl border border-emerald-100 bg-emerald-50/60 p-5">
              <h3 className="font-bold text-slate-950">Norite sutvarkyti įmonės DSS dokumentus ir parašus?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">DssPro padeda tvarkyti darbuotojų saugos procesus, instruktažus ir pasirašytus žurnalus vienoje vietoje.</p>
              <a href="/#kainos" className="mt-4 inline-flex rounded-lg bg-[#0c4a3b] px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900">Susipažinti su DssPro</a>
            </div>
            <h3 className="mt-8 mb-4 text-lg font-bold text-slate-950">Atsakymų peržiūra</h3>
            <div className="space-y-3">
              {questions.map((question, index) => {
                const correct = isCorrect(question, answers[question.id]);
                return (
                  <details key={question.id} className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900"><span className={correct ? 'mr-2 text-emerald-700' : 'mr-2 text-rose-700'}>{correct ? '✓' : '×'}</span>{index + 1}. {question.question}</summary>
                    <div className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600">
                      <p><strong>Jūsų atsakymas:</strong> {typeof answers[question.id] === 'number' ? question.options[answers[question.id]] : 'Neatsakyta'}</p>
                      <p className="mt-1"><strong>Teisingas atsakymas:</strong> {question.options[Array.isArray(question.correctIndexes) ? question.correctIndexes[0] : question.correctIndex]}</p>
                      {question.explanation && <p className="mt-2">{question.explanation}</p>}
                    </div>
                  </details>
                );
              })}
            </div>
            <button type="button" onClick={reset} className="mt-7 rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:border-emerald-700 hover:text-emerald-800">Pasirinkti kitą kategoriją</button>
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-500">Klausimas {questionIndex + 1} iš {questions.length}</p>
              {mode === 'exam' && <span className={`rounded-full px-3 py-1 text-sm font-bold ${secondsLeft < 60 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>{formattedTime}</span>}
            </div>
            <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
            </div>
            <h2 className="text-lg font-bold leading-7 text-slate-950 sm:text-xl">{questions[questionIndex].question}</h2>
            <div className="mt-5 space-y-3">
              {questions[questionIndex].options.map((option, index) => {
                const answered = selectedAnswer !== null;
                const correctIndex = questions[questionIndex].correctIndex;
                const showCorrect = mode === 'learning' && answered && index === correctIndex;
                const showWrong = mode === 'learning' && answered && index === selectedAnswer && index !== correctIndex;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => chooseAnswer(index)}
                    disabled={mode === 'learning' && selectedAnswer !== null}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm leading-6 transition ${showCorrect ? 'border-emerald-500 bg-emerald-50 text-emerald-950' : showWrong ? 'border-rose-400 bg-rose-50 text-rose-950' : selectedAnswer === index ? 'border-emerald-600 bg-emerald-50/60 text-slate-950' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'} disabled:cursor-default`}
                  >
                    <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-current text-xs font-bold">{String.fromCharCode(65 + index)}</span>{option}
                  </button>
                );
              })}
            </div>
            {mode === 'learning' && selectedAnswer !== null && (
              <div className={`mt-5 rounded-xl border p-4 text-sm leading-6 ${isCorrect(questions[questionIndex], selectedAnswer) ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                <strong>{isCorrect(questions[questionIndex], selectedAnswer) ? 'Teisingai.' : 'Neteisingai.'}</strong>
                {questions[questionIndex].explanation && <p className="mt-1">{questions[questionIndex].explanation}</p>}
                {questions[questionIndex].source && <p className="mt-2 text-xs opacity-70">Šaltinis: {questions[questionIndex].source}</p>}
              </div>
            )}
            <div className="mt-6 flex justify-end">
              {questionIndex < questions.length - 1 ? (
                <button type="button" onClick={nextQuestion} disabled={mode === 'learning' && selectedAnswer === null} className="rounded-xl bg-[#0c4a3b] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Kitas klausimas</button>
              ) : (
                <button type="button" onClick={() => setFinished(true)} disabled={mode === 'learning' && selectedAnswer === null} className="rounded-xl bg-[#0c4a3b] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Baigti testą</button>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 px-5 py-6 text-center text-xs text-slate-500">
        <nav aria-label="Poraštės nuorodos" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <a href="/" className="font-semibold text-emerald-800">DSS Pro</a>
          <a href="/tinklarastis" className="font-semibold text-emerald-800">Tinklaraštis</a>
          <a href="/naudojimo-salygos" className="font-semibold text-emerald-800">Naudojimo sąlygos</a>
          <a href="/privatumo-politika" className="font-semibold text-emerald-800">Privatumo politika</a>
        </nav>
        <p className="mt-3">© 2026 DSS Pro. Testas skirtas savarankiškam mokymuisi pagal viešai skelbiamus pavyzdinius klausimus.</p>
      </footer>
    </div>
  );
}
