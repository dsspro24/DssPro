import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import SignaturePad from './SignaturePad.jsx';
import { hydrateSignatureImages, removeSignatureAsset, uploadCreatorAsset, uploadSignatureDataUrl } from './lib/storageAssets.js';
import aapTemplate from './assets/aap-template.html?raw';
import { supabase } from './lib/supabase.js';
import employeeFamiliarizationTemplate from './assets/employee-familiarization-card.html?raw';
import workplaceInstructionsTemplate from './assets/workplace-dss-instructions-journal.html?raw';
import introInstructionsTemplate from './assets/intro-dss-instructions-journal.html?raw';
import workRulesTemplate from './assets/work-rules-familiarization-journal.html?raw';
import fireSafetyJournalTemplate from './assets/fire-safety-instructions-journal.html?raw';
import knowledgeAssessmentProtocolTemplate from './assets/knowledge-assessment-protocol.html?raw';
import jobDescriptionFamiliarizationTemplate from './assets/job-description-familiarization-journal.html?raw';
import internalDocumentsRegisterTemplate from './assets/internal-documents-register-journal.html?raw';
import chemicalSafetyInstructionCardTemplate from './assets/chemical-safety-instruction-card.html?raw';
import {
  Archive,
  ArrowRight,
  ArrowUpDown,
  BellRing,
  Bell,
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  CreditCard,
  Download,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileSignature,
  FileText,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  LogOut,
  Menu,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Shirt,
  Trash2,
  Upload,
  Users,
  UserPlus,
  X,
} from 'lucide-react';

function printPdfHtml(html, title) {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.title = title;
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:800px;border:0';
  return new Promise((resolve, reject) => {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      window.clearTimeout(timeout);
      frame.remove();
      resolve();
    };
    const timeout = window.setTimeout(cleanup, 10 * 60 * 1000);
    frame.addEventListener('error', () => {
      window.clearTimeout(timeout);
      frame.remove();
      reject(new Error('Nepavyko paruošti HTML dokumento spausdinimui.'));
    }, { once: true });
    frame.addEventListener('load', async () => {
      try {
        const printWindow = frame.contentWindow;
        const printDocument = frame.contentDocument;
        if (!printWindow || !printDocument) throw new Error('Nepavyko atidaryti dokumento.');
        await printDocument.fonts?.ready;
        await Promise.all([...printDocument.images].map((image) => image.decode().catch(() => {})));
        printWindow.addEventListener('afterprint', cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        window.clearTimeout(timeout);
        frame.remove();
        reject(error);
      }
    }, { once: true });
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

function createArchivePdfHtml(element) {
  const clone = element.cloneNode(true);
  clone.classList.add('archive-print-target');
  clone.querySelectorAll('.archive-print-controls').forEach((control) => control.remove());
  clone.querySelectorAll('.archive-person-print-title').forEach((title) => { title.style.display = 'block'; });
  const styles = [...document.head.querySelectorAll('style, link[rel="stylesheet"]')]
    .map((style) => style.outerHTML)
    .join('\n');
  const printOverrides = '<style>body{margin:0;background:#fff}.archive-print-target{position:relative!important;inset:auto!important;display:block!important;width:100%!important;max-width:none!important;max-height:none!important;height:auto!important;overflow:visible!important;border:0!important;background:#fff!important;box-shadow:none!important;color:#111827!important;padding:0!important}.archive-print-target *{visibility:visible!important}.archive-person-print-title{display:block!important}</style>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Darbuotojų archyvas</title>${styles}${printOverrides}</head><body>${clone.outerHTML}</body></html>`;
}

function resourceForDatabase(resource) {
  const databaseResource = { ...resource };
  delete databaseResource.image;
  delete databaseResource.html;
  const imageUrl = resource.imageUrl ?? (resource.image && !resource.image.startsWith('data:') ? resource.image : null);
  if (imageUrl) databaseResource.imageUrl = imageUrl;
  if (resource.htmlUrl) databaseResource.htmlUrl = resource.htmlUrl;
  return databaseResource;
}

function workspaceForDatabase(workspace) {
  const databaseWorkspace = { ...workspace };
  delete databaseWorkspace.commissionAssignments;
  delete databaseWorkspace.protocolCommissionSignatures;
  delete databaseWorkspace.commissionInvitations;
  delete databaseWorkspace.commissionTasks;
  delete databaseWorkspace.dssInvitations;
  const cleanSignature = (signature) => {
    const databaseSignature = { ...signature };
    delete databaseSignature.signatureImage;
    return databaseSignature;
  };
  const cleanAapIssuance = (issuance) => {
    const databaseIssuance = { ...issuance };
    delete databaseIssuance.signatureImage;
    return databaseIssuance;
  };
  return {
    ...databaseWorkspace,
    resources: (workspace.resources ?? []).map(resourceForDatabase),
    signatures: (workspace.signatures ?? []).map(cleanSignature),
    aapIssuances: (workspace.aapIssuances ?? []).map(cleanAapIssuance),
    archivedEmployees: (workspace.archivedEmployees ?? []).map((record) => ({
      ...record,
      resources: (record.resources ?? []).map(resourceForDatabase),
      signatures: (record.signatures ?? []).map(cleanSignature),
    })),
  };
}

const STORAGE_KEY = 'dsspro-local-demo-v1';
const defaultAapItems = [
  { id: 'aap-helmet', code: '', name: 'Galvos apdangalas (šalmas)', reason: '', quantity: 1, unit: 'Vnt.', validity: 'pagal gamintojo nurodymus', unitPrice: '' },
  { id: 'aap-boots', code: '', name: 'Darbo avalynė (pakietintais galais)', reason: '', quantity: 1, unit: 'Pora', validity: '24 mėn.', unitPrice: '' },
  { id: 'aap-suit', code: '', name: 'Darbo kostiumas', reason: '', quantity: 1, unit: 'Vnt.', validity: '12 mėn.', unitPrice: '' },
  { id: 'aap-earmuffs', code: '', name: 'Prieštriukšminės ausinės', reason: '', quantity: 1, unit: 'Vnt.', validity: 'iki susidėvėjimo', unitPrice: '' },
  { id: 'aap-gloves', code: '', name: 'Pirštinės, apsaugančios nuo mechaninio poveikio', reason: '', quantity: 1, unit: 'Pora', validity: 'iki susidėvėjimo', unitPrice: '' },
  { id: 'aap-glasses', code: '', name: 'Apsauginiai akiniai', reason: '', quantity: 1, unit: 'Vnt.', validity: 'iki susidėvėjimo', unitPrice: '' },
  { id: 'aap-belt', code: '', name: 'Apsauginis diržas (dirbantiems aukštyje)', reason: '', quantity: 1, unit: 'Vnt.', validity: 'pagal gamintojo nurodymus', unitPrice: '' },
  { id: 'aap-jacket', code: '', name: 'Striukė pašiltinta (šaltuoju metu)', reason: '', quantity: 1, unit: 'Vnt.', validity: '12 mėn.', unitPrice: '' },
  { id: 'aap-winter-boots', code: '', name: 'Pašiltinti batai (šaltuoju metu)', reason: '', quantity: 1, unit: 'Pora', validity: '24 mėn.', unitPrice: '' },
];
const requiredAapSizeFields = ['shoes', 'clothes', 'pants', 'jacket'];
const hasCompleteAapSizes = (employee) => requiredAapSizeFields.every((field) => employee?.sizes?.[field]?.trim());
const hasSavedAapSizes = (employee) => Boolean(employee?.aapCompleted) && hasCompleteAapSizes(employee);
const pinSignedStatusLabel = 'Pasirašyta PIN kodu';
const protocolBatchCapacity = 15;
const toLocalDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const getMedicalCertificateReminderDate = (validUntil) => {
  if (!validUntil || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return '';
  const date = new Date(`${validUntil}T12:00:00`);
  if (Number.isNaN(date.getTime()) || toLocalDateKey(date) !== validUntil) return '';
  date.setDate(date.getDate() - 14);
  return toLocalDateKey(date);
};
const formatProtocolDate = (dateKey) => dateKey ? new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${dateKey}T12:00:00`)) : '';
const isDateExpired = (value, now) => {
  if (!value) return false;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999`) : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < now;
};
const getProtocolPeriod = (value, cadence) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  const end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (cadence === 'weekly-sunday' ? 6 : 4));
  return { start: toLocalDateKey(monday), end: toLocalDateKey(end) };
};
const hasPassedProtocolTest = (employee, resource) => {
  if (!resource.relatedTestId) return true;
  const latestResult = (employee?.testResults ?? [])
    .filter((result) => result.resourceId === resource.relatedTestId)
    .sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt))[0];
  return latestResult?.passed === true;
};
const isProtocolBatchReady = (batch, employees, resource) => Boolean(batch.protocolDate)
  && employees.length > 0
  && employees.every((employee) => hasPassedProtocolTest(employee, resource));
const addEmployeeToProtocolBatches = (data, employee) => {
  const org = data.organizations.find((item) => item.id === employee.orgId);
  if (!org) return { batches: data.protocolBatches ?? [], resourceIds: employee.resourceIds ?? [] };
  const batches = [...(data.protocolBatches ?? [])];
  const resourceIds = new Set(employee.resourceIds ?? []);
  const protocols = data.resources.filter((resource) => resource.templateKind === 'knowledge-assessment-protocol'
    && org.resources.includes(resource.id)
    && (resource.relatedTestId ? employee.resourceIds?.includes(resource.relatedTestId) : employee.resourceIds?.includes(resource.id)));

  protocols.forEach((resource) => {
    const testResult = employee.testResults?.filter((result) => result.resourceId === resource.relatedTestId).sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt))[0];
    if (resource.relatedTestId && testResult?.passed === true) resourceIds.add(resource.id);
    if (batches.some((batch) => batch.orgId === org.id && batch.resourceId === resource.id && batch.employeeIds.includes(employee.id))) return;
    const employeeDate = employee.invitedAt ?? employee.createdAt ?? testResult?.completedAt;
    if (!employeeDate) return;
    const cadence = org.resourceSettings?.[resource.id]?.protocolCadence ?? 'weekly-friday';
    let batch;
    if (cadence === 'until-full') {
      batch = [...batches].reverse().find((item) => item.orgId === org.id && item.resourceId === resource.id && item.cadence === cadence && item.employeeIds.length < protocolBatchCapacity);
    } else {
      const period = getProtocolPeriod(employeeDate, cadence);
      if (!period) return;
      batch = batches.find((item) => item.orgId === org.id && item.resourceId === resource.id && item.cadence === cadence && item.periodStart === period.start && item.periodEnd === period.end && item.employeeIds.length < protocolBatchCapacity);
      if (!batch) {
        const segment = batches.filter((item) => item.orgId === org.id && item.resourceId === resource.id && item.periodStart === period.start).length + 1;
        batch = {
          id: `protocol-batch-${org.id}-${resource.id}-${period.start}-${segment}`,
          orgId: org.id,
          resourceId: resource.id,
          cadence,
          periodStart: period.start,
          periodEnd: period.end,
          protocolDate: period.end,
          number: batches.filter((item) => item.orgId === org.id && item.resourceId === resource.id).length + 1,
          employeeIds: [],
          createdAt: new Date().toISOString(),
        };
        batches.push(batch);
      }
    }
    if (!batch) {
      const number = batches.filter((item) => item.orgId === org.id && item.resourceId === resource.id).length + 1;
      batch = {
        id: `protocol-batch-${org.id}-${resource.id}-fill-${number}`,
        orgId: org.id,
        resourceId: resource.id,
        cadence,
        periodStart: employeeDate.slice(0, 10),
        periodEnd: '',
        protocolDate: '',
        number,
        employeeIds: [],
        createdAt: new Date().toISOString(),
      };
      batches.push(batch);
    }
    batch.employeeIds = [...batch.employeeIds, employee.id];
    if (cadence === 'until-full' && batch.employeeIds.length === protocolBatchCapacity) {
      batch.periodEnd = employeeDate.slice(0, 10);
      batch.protocolDate = batch.periodEnd;
    }
  });

  return { batches, resourceIds: [...resourceIds] };
};
const defaultResourceTypes = ['Testas', 'Žurnalas', 'Kortelė', 'Protokolas'];
const jobDescriptionJournalId = 'res-job-description-journal';
const internalDocumentsRegisterId = 'res-internal-documents-register';
const chemicalSafetyInstructionCardId = 'res-chemical-safety-instruction-card';
const knowledgeAssessmentProtocolId = 'res-knowledge-assessment-protocol';
const defaultCompanyProtocolTemplates = [
  { id: 'res-protocol-fire-safety', title: 'Gaisrinės saugos žinių patikrinimo protokolas', testId: 'res-fire-knowledge-test' },
  { id: 'res-protocol-workplace-conduct', title: 'Prieš psichologinį ir fizinį smurtą, diskriminaciją ir priekabiavimą nukreipta mokymo programos žinių patikrinimo protokolas', testId: 'res-workplace-conduct-test' },
  { id: 'res-protocol-cargo-handling', title: 'Darbuotojų, atliekančių krovimo darbus, atestavimo, mokymo darbo vietoje protokolas', testId: 'res-manual-handling-test' },
  { id: 'res-protocol-chemical-safety', title: 'Darbuotojų, atliekančių darbus su pavojingomis cheminėmis medžiagomis, mokymo darbo vietoje protokolas', testId: 'res-chemical-safety-test' },
  { id: 'res-protocol-work-at-height', title: 'Darbuotojų, atliekančių darbus aukštyje atestavimo, mokymo darbo vietoje protokolas', testId: 'res-work-at-height-test' },
  { id: 'res-protocol-excavation', title: 'Grunto kasimo, tvirtinimo ir kiti darbai iškasose ir pylimuose mokymo programos protokolas', testId: 'res-excavation-safety-test' },
];
const workplaceConductTestId = 'res-workplace-conduct-test';
const workplaceConductQuestions = [
  { prompt: 'Kas yra psichologinis smurtas darbe?', options: ['Prieš darbuotoją nukreiptas tikslinis, sisteminis, ilgesnį laiką pasikartojantis elgesys ar veiksmai priekabiaujant prie darbuotojo ar jį bauginant, siekiant sumažinti jo vertę ir profesinius sugebėjimus, pažeminti, pašiepti, atitolinti nuo kolektyvo.', 'Tikslingas priekabiavimas, įžeidinėjimas norint pašiepti.', 'Balso pakėlimas, keikimasis ir kitoks neetiškas elgesys darbo vietoje.'], correctIndex: 0 },
  { prompt: 'Kur pirmiausia reikia kreiptis patyrus psichologinį ar fizinį smurtą?', options: ['Pranešti administracijai ir kitiems kolegoms.', 'Parašyti Valstybinei darbo inspekcijai arba darbo ginčų komisijai.', 'Pranešti įmonėje atsakingiems asmenims už psichologinį ir fizinį smurtą, diskriminaciją arba kreiptis į tiesioginį vadovą ir rašyti pranešimą dėl psichologinio smurto, diskriminacijos ar priekabiavimo.'], correctIndex: 2 },
  { prompt: 'Psichologinio smurto darbe požymiai:', options: ['Grasinimai, šmeižtas, pasikartojantis sarkazmas, viešas žeminimas, ignoravimas ir izoliavimas nuo kitų kolegų.', 'Vienkartinis pašiepimas, vieną kartą pasakytas sarkazmas ar pastaba, periodiniai patikrinimai.', 'Periodiniai patikrinimai, pašiepimas, asmens ignoravimas konkrečioje situacijoje.'], correctIndex: 0 },
  { prompt: 'Kaip apibūdintumėte diskriminaciją?', options: ['Pasikartojanti darbdavio kritika, pakeltas balsas, norint nužeminti.', 'Vadovo pagrįstos pastabos dėl netvarkingos aprangos, nenaudojamų asmeninių apsaugos priemonių.', 'Nelygios sąlygos ir nesąžiningas elgesys su darbuotoju dėl amžiaus, lyties, negalios, rasės, įsitikinimų ar pažiūrų, tautybės, pilietybės, kilmės, kalbos, tikėjimo ir pan.'], correctIndex: 2 },
  { prompt: 'Diskriminacijos darbe požymiai:', options: ['Priedų neišmokėjimas dėl prastų rezultatų, viršvalandžiai.', 'Neadekvatus darbo krūvis, manipuliavimas darbo užmokesčiu.', 'Pagrįstos pastabos ir kritika, periodiniai patikrinimai.'], correctIndex: 1 },
  { prompt: 'Koks svarbiausias principas tiriant psichologinio smurto atvejus?', options: ['Konfidencialumas ir nešališkumas.', 'Viešas visų kolegų įtraukimas į tyrimą.', 'Vadovo asmeninė nuomonė.'], correctIndex: 0 },
  { prompt: 'Kas padeda sumažinti psichologinio smurto riziką įmonėje?', options: ['Aiškios taisyklės, mokymai, saugi pranešimų sistema.', 'Didelis darbo krūvis.', 'Vadovo griežta kontrolė kiekvieną dieną.'], correctIndex: 0 },
  { prompt: 'Kaip apibūdintumėte priekabiavimą darbe?', options: ['Bet koks nepriimtinas elgesys ar jo grėsmė siekiant padaryti fizinį, psichologinį, seksualinį ar ekonominį poveikį, kai gali atsirasti įžeidžianti aplinka arba (ir) atsirado arba gali atsirasti fizinė, turtinė ir (arba) neturtinė žala.', 'Turtinė ir neturtinė žala patirta dirbant ilgą laiką darbo vietoje.', 'Izoliacija ir ignoravimas darbo vietoje kolegų arba darbdavio.'], correctIndex: 1 },
  { prompt: 'Kas nelaikoma psichologiniu smurtu darbe?', options: ['Skirtingų nuomonių reiškimas, darbuotojo elgesys dėl informacijos stokos, pagrįsta kritika ir pastabos.', 'Aprangos kritikavimas, pašiepimas religinių ar politinių pažiūrų.', 'Pasikartojančios į asmenį nukreiptos seksistiškos žinutės, kolegų įžeidžiančio pobūdžio komentarai.'], correctIndex: 0 },
  { prompt: 'Kas nelaikoma diskriminacija darbe?', options: ['Kritika dėl politinių pažiūrų.', 'Pastovios pagrįstos pastabos dėl netvarkingos aprangos, asmeninių apsaugos priemonių.', 'Nepagrįstos pastabos dėl aprangos.'], correctIndex: 0 },
  { prompt: 'Kas nelaikoma priekabiavimu darbe?', options: ['Darbuotojo elgesys dėl informacijos ir darbo etiketo stokos, darbdavio pagrįstos pastabos.', 'Pastovus nepadorios informacijos siuntimas, seksistiško pobūdžio žinutės.', 'Algos neišmokėjimas nepagrindžiant, priedų nemokėjimas be priežasties.'], correctIndex: 0 },
  { prompt: 'Tinkami įrodymai pamačius arba patyrus psichologinį ar fizinį smurtą:', options: ['Išsaugotos SMS žinutės, el. laiškai, nuotraukos ir vaizdo bei garso įrašai, kuriuose atsispindi pažeidimas, liudininkai.', 'Skundas parašytas Valstybinei darbo inspekcijai, darbo tarybai.', 'Receptai ir išrašai dėl lėtinių ligų.'], correctIndex: 0 },
];
const chemicalSafetyTestId = 'res-chemical-safety-test';
const chemicalSafetyQuestions = [
  { prompt: 'Cheminės medžiagos ir preparatai priskiriami:', options: ['Sprogstamosios medžiagos ir preparatai.', 'Oksiduojančios medžiagos ir preparatai.', 'Ypač degios medžiagos ir preparatai.', 'Labai degios medžiagos ir preparatai.', 'Degios medžiagos ir preparatai.', 'Nedegios medžiagos ir preparatai.'], correctIndices: [0, 1, 2, 3, 4] },
  { prompt: 'Iškraunant ir pakraunant chemines medžiagas būtina jas:', options: ['Vilkti.', 'Mėtyti.', 'Perkelti nepažeidžiant pakuotės.'], correctIndex: 2 },
  { prompt: 'Kaip turi būti sandėliuojamos cheminės medžiagos?', options: ['Taip, kad matytųsi pakuotė.', 'Sudėtos bet kaip.', 'Taip, kad pakuotės etiketė būtų atsukta į praėjimo pusę.'], correctIndex: 2 },
  { prompt: 'Chemines medžiagas reikia sandėliuoti:', options: ['Gerai vėdinamoje, užrakinamoje patalpoje.', 'Koridoriuje.', 'Bet kurioje patalpoje.'], correctIndex: 0 },
  { prompt: 'Chemines medžiagas prie šildymo įrenginių galima laikyti ne arčiau kaip:', options: ['0,5 m.', '1 m.', '3 m.'], correctIndex: 1 },
  { prompt: 'Dezinfekavimo medžiagų atsargas laikyti tik:', options: ['Pažeistoje taroje.', 'Sandarioje, nepažeistoje taroje.', 'Nesvarbu kaip.'], correctIndex: 1 },
  { prompt: 'Kur leidžiama išpilti sprogius ir degius produktus?', options: ['Į specialios paskirties talpas.', 'Į kanalizacijos sistemą.', 'Suderinus su pareigūnais, į gruntą.'], correctIndex: 0 },
  { prompt: 'Pirmosios pagalbos priemonės patekus cheminėms medžiagoms:', options: ['Patekus ant odos, nusivilkti užterštus drabužius ir odą nuplauti vandeniu bei muilu.', 'Patekus į akis, išversti viršutinį voką, apie 10 min. plauti tekančiu vandeniu ir kviesti gydytoją.', 'Prarijus, nutraukti cheminės medžiagos patekimą, nesukelti vėmimo ir skubiai kviesti greitąją pagalbą.'], correctIndices: [0, 1, 2] },
  { prompt: 'Saugūs darbo metodai:', options: ['Darbo metu naudoti asmenines apsaugos priemones.', 'Darbo ir kasdienius rūbus laikyti atskirai.', 'Valgyti, gerti ir rūkyti tik specialiai įrengtose vietose.', 'Reguliariai praustis.', 'Su cheminėmis medžiagomis dirbti tik apmokytiems ir instruktuotiems darbuotojams.'], correctIndices: [0, 1, 2, 3, 4] },
  { prompt: 'Gaisrinės saugos reikalavimai:', options: ['Žinoti pirmines gaisro gesinimo priemones ir mokėti jomis naudotis.', 'Rūkyti tik tam skirtose, ženklais pažymėtose ir tinkamai įrengtose vietose.', 'Rūkyti ir valgyti savo darbo vietoje.'], correctIndices: [0, 1] },
];
const workAtHeightTestId = 'res-work-at-height-test';
const workAtHeightQuestions = [
  { prompt: 'Nuo kurio aukščio pradedant atliekami darbai priskiriami darbams, atliekamiems aukštyje?', options: ['1 m.', '1,1 m.', '5 m.'], correctIndex: 1 },
  { prompt: 'Nuo kurio aukščio pradedant atliekami darbai priskiriami aukštalipių darbams?', options: ['1 m.', '1,1 m.', '5 m.'], correctIndex: 2 },
  { prompt: 'Kokiame aukštyje dirbantis darbuotojas turi turėti medicinos pažymą?', options: ['1 m.', '1,1 m.', '5 m.'], correctIndex: 2 },
  { prompt: 'Darbuotojo, atliekančio darbus aukštyje, apsaugos priemonės:', options: ['Apsaugos diržas.', 'Apsauginis šalmas.', 'Respiratorius.', 'Apsauginiai akiniai.'], correctIndices: [0, 1] },
  { prompt: 'Darbuotojo, atliekančio darbus aukštyje, paaukštinimo priemonės:', options: ['Kopėčios, lipynės.', 'Dėžės, kėdės.', 'Pastoliai, paklotai.'], correctIndices: [0, 2] },
  { prompt: 'Draudžiama atlikti darbus aukštyje, jeigu:', options: ['Vėjo greitis 12–15 m/s.', 'Vėjo greitis 2–10 m/s.', 'Vėjo greitis 5–9 m/s.'], correctIndex: 0 },
  { prompt: 'Draudžiama dirbti ant pastolių:', options: ['Žmonių grupėmis.', 'Arti veikiančių elektros tiekimo linijų.', 'Vasarą.'], correctIndex: 1 },
  { prompt: 'Kokiame aukštyje dirbant naudoti apsauginį diržą?', options: ['2 m.', '1,5 m.', '1,3 m.'], correctIndex: 0 },
  { prompt: 'Saugos diržai turi būti:', options: ['Su žyma apie atliktą bandymą.', 'Be žymos.', 'Be defektų.'], correctIndices: [0, 2] },
  { prompt: 'Išmontuotų pastolių elementus reikia:', options: ['Mesti iš aukščio.', 'Laikyti darbo vietoje.', 'Atsargiai nuleisti keliamaisiais mechanizmais ar virvėmis.'], correctIndex: 2 },
  { prompt: 'Kaip išmontuojami pastoliai?', options: ['Nuo apačios į viršų.', 'Aukštais iš viršaus į apačią.', 'Nugriaunami.'], correctIndex: 1 },
  { prompt: 'Ant pristatomų kopėčių draudžiama:', options: ['Dirbti šalia ar virš neapsaugotų veikiančių mašinų besisukančių dalių ir transporterių.', 'Naudoti rankines elektros mašinas ir parakinį įrankį.', 'Virinti dujomis ar elektra.', 'Tempti laidus ar prilaikyti aukštyje sunkias detales.'], correctIndices: [0, 1, 2, 3] },
  { prompt: 'Darbuotojų, dirbančių aukštyje, krovinių padavimo angos turi būti atitvertos:', options: ['Iš vienos pusės.', 'Iš dviejų pusių.', 'Iš keturių pusių.'], correctIndex: 2 },
  { prompt: 'Darbininko, dirbančio aukštyje, profesinės rizikos veiksniai:', options: ['Kritimas iš aukščio.', 'Nepalankios oro sąlygos.', 'Galimybė susižeisti darbo įrankiais.'], correctIndices: [0, 1, 2] },
  { prompt: 'Įvykus nelaimingam atsitikimui pakeliui į darbą ar iš darbo, darbuotojas:', options: ['Pats privalo pranešti apie nelaimingą atsitikimą.', 'Per kitus asmenis turi pranešti apie nelaimingą atsitikimą.', 'Gali nepranešti.'], correctIndices: [0, 1] },
  { prompt: 'Kurie iš šių požymių yra smegenų sutrenkimo požymiai?', options: ['Galvos skausmas.', 'Vėmimas.', 'Kraujavimas iš ausų ir nosies.'], correctIndices: [0, 1] },
  { prompt: 'Kuris požymis rodo, kad lūžo galūnės kaulas?', options: ['Galūnės skaudamos vietos patinimas.', 'Sumuštos vietos kraujavimas.', 'Visiškas galūnės nejautrumas.'], correctIndex: 0 },
  { prompt: 'Kokios yra pirminės gaisro gesinimo priemonės?', options: ['Smėlis.', 'Gesintuvai.', 'Nedegus audeklas.', 'Ledas.'], correctIndices: [0, 1, 2] },
];
const excavationSafetyTestId = 'res-excavation-safety-test';
const excavationSafetyQuestions = [
  { prompt: 'Aptikus sprogmenis reikia iškviesti:', options: ['Kariuomenę.', 'Tiesioginius vadovus.', 'Policiją.'], correctIndex: 2 },
  { prompt: 'Sušalusį gruntą virš kabelių leidžiama nukasti:', options: ['Kastuvu, prieš tai pašildžius atvira liepsna.', 'Kastuvu su laužtuvo pagalba.', 'Tik kastuvu.'], correctIndex: 2 },
  { prompt: 'Kasant tranšėjas ir radus schemoje nepažymėtą kabelį reikia:', options: ['Nutraukti darbus ir iškviesti darbų vadovą.', 'Tęsti darbus atsargiau.', 'Paženklinti ir kasti toliau.'], correctIndex: 0 },
  { prompt: 'Pagal tvirtinimo būdą tranšėjos būna:', options: ['Ramstomos ir neramstomos.', 'Vertikalios ir horizontalios.', 'Gilios ir seklios.'], correctIndex: 0 },
  { prompt: 'Kokiu atstumu nuo iškasos briaunos kraunamas iškastas gruntas?', options: ['Ne mažiau kaip 0,5 m.', 'Ne mažiau kaip 1,5 m.', 'Arčiau, kad būtų patogiau.'], correctIndex: 1 },
  { prompt: 'Ar galima pradėti grunto kasimo darbus iškasose be išduoto leidimo?', options: ['Taip, jei darbininkai apmokyti.', 'Ne, būtina turėti leidimą darbams.', 'Taip, jei darbai vyksta ne giliau kaip 1,5 metro.'], correctIndex: 1 },
  { prompt: 'Kokio gylio iškasose būtina įrengti atramines konstrukcijas (ramščius)?', options: ['Didesnėse nei 1 metro gylio iškasose.', 'Didesnėse nei 1,25 metro gylio iškasose.', 'Visose iškasose, nepriklausomai nuo gylio.'], correctIndex: 1 },
  { prompt: 'Ką daryti, jei iškasa pradeda slinkti?', options: ['Bėgti iš iškasos.', 'Kviesti darbų vadovą ir sustiprinti šlaitus.', 'Nekreipti dėmesio.'], correctIndex: 1 },
  { prompt: 'Kaip suteikti pirmąją pagalbą susižeidus ranką?', options: ['Uždėti spaudžiamąjį tvarstį ir pranešti vadovui.', 'Uždėti šaltą kompresą ir dirbti toliau.', 'Nepaisyti ir tęsti darbą.'], correctIndex: 0 },
  { prompt: 'Ką daryti atsiradus kibirkščiavimui ar ugniai šalia iškasos?', options: ['Nedelsiant gesinti gesintuvu ir informuoti vadovą.', 'Palaukti, gal pati užges.', 'Išeiti iš darbo vietos.'], correctIndex: 0 },
  { prompt: 'Kas turi patikrinti darbo vietą prieš kasimą?', options: ['Pats darbuotojas.', 'Atsakingas darbų vadovas.', 'Trečiosios tarnybos.'], correctIndex: 1 },
  { prompt: 'Kodėl svarbu dirbti dviese giliose iškasose?', options: ['Kad greičiau vyktų darbas.', 'Kad vienas galėtų padėti nelaimės atveju.', 'Kad nebūtų naudojamasi telefonu darbo metu.'], correctIndex: 1 },
];
const fireKnowledgeTestId = 'res-fire-knowledge-test';
const fireKnowledgeQuestions = [
  { prompt: 'Kokiu telefono numeriu kviečiami ugniagesiai?', options: ['112.', '011.', '01.'], correctIndex: 0 },
  { prompt: 'Kokios pagrindinės gesinimo medžiagos naudojamos šiuolaikiniuose gesintuvuose?', options: ['Putos.', 'Dujos.', 'Milteliai.', 'Visi atsakymai teisingi.'], correctIndex: 3 },
  { prompt: 'Putų gesintuvais gesinti draudžiama:', options: ['Neišjungtus elektros prietaisus.', 'Žmogaus veidą.', 'Šarminius metalus.', 'Visi atsakymai teisingi.'], correctIndex: 3 },
  { prompt: 'Veiksmų seka kilus gaisrui:', options: ['Iškviesti ugniagesius, evakuoti žmones, gesinti gaisrą.', 'Evakuoti žmones, iškviesti ugniagesius, gesinti gaisrą.', 'Gesinti gaisrą, evakuoti žmones, iškviesti ugniagesius.'], correctIndex: 0 },
  { prompt: 'Gaisrų klasė C – tai:', options: ['Dujų gaisrai.', 'Metalų gaisrai.', 'Skystųjų arba galinčių suskystėti kietųjų medžiagų gaisrai.', 'Kietųjų medžiagų gaisrai.'], correctIndex: 0 },
  { prompt: 'Kokios medžiagos priskiriamos sunkiai degių medžiagų grupei?', options: ['Medžiagos, kurios užsidega tik nuo galingo ugnies šaltinio.', 'Medžiagos, kurios tik smilksta ir anglėja.', 'Medžiagos, kurios dega, smilksta ir anglėja veikiant uždegimo šaltiniui, o jį pašalinus procesai savaime nutrūksta.', 'Visi aukščiau nurodyti teiginiai teisingi.'], correctIndex: 2 },
  { prompt: 'Kiek evakuacinių išėjimų turi būti iš kiekvieno pastato aukšto?', options: ['Ne mažiau kaip 2 visuomeninės paskirties pastate, kai aukštų skaičius daugiau kaip du.', 'Ne mažiau kaip 3.', 'Išėjimų skaičius priklauso nuo aukšte esančių žmonių skaičiaus.', 'Išėjimų skaičius priklauso nuo pastato aukštų skaičiaus.'], correctIndex: 0 },
  { prompt: 'Kokie reikalavimai keliami evakuaciniuose išėjimuose esančių durų atidarymo krypčiai?', options: ['Durys turi atsidaryti tik evakuacijos kryptimi.', 'Durys gali atsidaryti į patalpų vidų, jei jose nuolat būna ne daugiau kaip 25 žmonės.', 'Durys gali atsidaryti į patalpos vidų sandėliuose, kurių plotas ne didesnis kaip 300 m².', 'Durys gali atsidaryti į patalpų vidų, jei jose nuolat būna ne daugiau kaip 15 žmonių.'], correctIndex: 3 },
  { prompt: 'Evakuacijos kelių plotis turi būti ne mažesnis kaip:', options: ['1,5 m.', '1,2 m.', '2,0 m.', '2,5 m.'], correctIndex: 1 },
  { prompt: 'Evakuacijos keliuose praėjimų aukštis turi būti ne mažesnis kaip:', options: ['2,0 m.', '2,2 m.', '1,8 m.', '2,5 m.'], correctIndex: 0 },
  { prompt: 'Masinė žmonių buvimo patalpa yra tokia, kurioje vienu metu gali būti daugiau kaip:', options: ['100 žmonių.', '75 žmonės.', '50 žmonių.', '25 žmonės.'], correctIndex: 2 },
  { prompt: 'Kokios yra gamybos kategorijos pagal gaisro arba sprogimo ir gaisro kilimo pavojų?', options: ['Asg, Bsg, Cg.', 'A, B, C, D.', 'Asg, Bsg, Cg, Dg, Eg.', 'A, B, Cg, Dsg, Esy, G.'], correctIndex: 2 },
  { prompt: 'Kokia yra tikslingiausia veiksmų seka kilus gaisrui?', options: ['Iškviesti ugniagesius, evakuoti žmones, gesinti gaisrą.', 'Evakuoti žmones, iškviesti ugniagesius, gesinti gaisrą.', 'Gesinti gaisrą, evakuoti žmones, iškviesti ugniagesius.'], correctIndex: 0 },
  { prompt: 'Bendrosios gaisrinės saugos taisyklės nustato pagrindinius gaisrinės saugos reikalavimus:', options: ['Eksploatuojant pastatus, statinius ir technologinius įrenginius.', 'Eksploatuojant, statant, rekonstruojant bei techniškai pertvarkant pastatus, statinius ir technologinius įrenginius.', 'Abu atsakymai teisingi.'], correctIndex: 2 },
  { prompt: 'Krypties ir informacijos ženklai išdėstomi:', options: ['Kad jie būtų gerai matomi iš bet kurios patalpos vietos.', 'Prie evakuacinių išėjimų ir gesinimo priemonių.', 'Laisvai pasirinktoje vietoje.'], correctIndex: 0 },
  { prompt: 'Atstumas nuo elektros šviestuvų iki sandėliuojamų degių medžiagų turi būti ne mažesnis kaip:', options: ['0,2 m.', '0,5 m.', '1,0 m.'], correctIndex: 1 },
  { prompt: 'Naudoti elektros laidus ir kabelius su pažeista izoliuojančia medžiaga:', options: ['Draudžiama.', 'Leidžiama.', 'Leidžiama, jei nėra gaisro kilimo pavojaus.'], correctIndex: 0 },
  { prompt: 'Įmonės gamybinėse ir sandėliavimo patalpose šildyti galima naudojant:', options: ['Savo gamybos šildymo prietaisus.', 'Atviro tipo pramoninės gamybos prietaisus.', 'Uždaro tipo pramoninės gamybos prietaisus.'], correctIndex: 2 },
  { prompt: 'Ant rampų draudžiama laikyti degias medžiagas:', options: ['Darbo metu.', 'Ne darbo metu.', 'Visą parą.'], correctIndex: 1 },
  { prompt: 'Lengvieji automobiliai aikštelėse statomi paliekant tarp jų:', options: ['0,6 m atstumą.', '0,8 m atstumą.', '1,0 m atstumą.'], correctIndex: 0 },
];
const manualHandlingTestId = 'res-manual-handling-test';
const manualHandlingQuestions = [
  { prompt: 'Krovinių kėlimo rankomis ribos:', options: ['Nuo 5 kg iki 25 kg.', 'Nuo 20 kg iki 45 kg.', 'Nuo 15 kg iki 50 kg.'], correctIndex: 0 },
  { prompt: 'Kraunami kroviniai turi būti:', options: ['Slystantys.', 'Krintantys.', 'Stabilūs.'], correctIndex: 2 },
  { prompt: 'Krovinių transportavimo rankomis ruožai turi būti:', options: ['Drėkinami.', 'Gerai apšviesti.', 'Su stabiliu pagrindu, be paslydimo pavojų ir neužkrauti gamybinėmis atliekomis.'], correctIndices: [1, 2] },
  { prompt: 'Pakraunant ar iškraunant sunkesnius kaip 25 kg krovinius ir keliant juos aukščiau kaip 3 m būtina:', options: ['Krauti rankomis.', 'Naudoti kėlimo mechanizmus.', 'Pakviesti į pagalbą padėjėjus.'], correctIndex: 1 },
  { prompt: 'Nešant krovinius ant pečių reikia:', options: ['Išlaikyti nuotolį.', 'Lenkti vienam kitą.', 'Stumdytis.'], correctIndex: 0 },
  { prompt: 'Darbuotojai (krovikai) turi būti aprūpinti AAP:', options: ['Pirštinėmis.', 'Apsaugine avalyne.', 'Apsauginiais diržais.', 'Apsauginiu skydeliu.'], correctIndices: [0, 1] },
  { prompt: 'Siekiant kėlimo metu išvengti rizikos, krovinys turi būti:', options: ['Išpakuotas.', 'Bet koks.', 'Tinkamai įpakuotas ir parengtas kėlimui.'], correctIndex: 2 },
  { prompt: 'Perkeliant ar pernešant smulkius krovinius reikia panaudoti:', options: ['Vamzdžius.', 'Metalo gabalus.', 'Kėlimo mechanizmus.'], correctIndex: 2 },
  { prompt: 'Stumti krovininį vežimėlį reikia iš:', options: ['Šono.', 'Galo.', 'Priekio.'], correctIndices: [0, 1] },
  { prompt: 'Nepatikimai arba netvarkingai sukrautus krovinius į rietuves ar dėžes galima taisyti:', options: ['Laužtuvais.', 'Padėklais.', 'Rankomis.'], correctIndex: 2 },
  { prompt: 'Kraunant krovinius pasilipus naudotis:', options: ['Dėžėmis.', 'Kėdėmis.', 'Inventorinėmis kopėčiomis su aštriais metaliniais kamščiais apačioje.'], correctIndex: 2 },
  { prompt: 'Medžiagas sandėlyje būtina krauti taip, kad atstumas tarp sienos ir krovinio būtų ne mažesnis kaip:', options: ['3 m.', '0,8 m.', '20 cm.'], correctIndex: 1 },
  { prompt: 'Keliant krovinį nuo žemės nugarą reikia laikyti:', options: ['Tiesią.', 'Sukūprintą.'], correctIndex: 0 },
  { prompt: 'Judant automašinai darbuotojui draudžiama:', options: ['Krauti krovinį iš jos.', 'Stovėti mašinos parkavimosi zonoje.', 'Įlipti arba išlipti iš jos.'], correctIndices: [1, 2] },
  { prompt: 'Darbuotojui su kėlimo mechanizmu leidžiama dirbti:', options: ['Leidus atsakingam darbo vadovui.', 'Turint atitinkamą pažymėjimą.', 'Esant būtinybei.'], correctIndex: 1 },
  { prompt: 'Saugūs darbo metodai:', options: ['Kelti svorį ištiesinus nugarą ir sulenkus kelius.', 'Kelti svorį kiek galima arčiau kūno.', 'Svorį nuleisti tolygiai.', 'Kelti svorį bet kaip.'], correctIndices: [0, 1, 2] },
  { prompt: 'Kroviniai kraunami į:', options: ['Kur yra vietos.', 'Vadovo nurodytą vietą.', 'Iš anksto numatytą vietą sandėliavimui.'], correctIndices: [1, 2] },
  { prompt: 'Darbuotojas turi gauti tikslią informaciją apie:', options: ['Krovinio svorį.', 'Krovinio turinį.', 'Krovinio kainą.'], correctIndices: [0, 1] },
  { prompt: 'Įvykus nelaimingam atsitikimui darbe, pakeliui į darbą ar iš darbo arba susirgus, darbuotojas:', options: ['Pats privalo pranešti apie nelaimingą atsitikimą ar ligą.', 'Per kitus asmenis turi pranešti apie nelaimingą atsitikimą ar ligą.', 'Gali nepranešti.'], correctIndices: [0, 1] },
];
const resourceTypeDisplayNames = { Testas: 'Testai', Žurnalas: 'Žurnalai', Kortelė: 'Kortelės', Protokolas: 'Protokolai' };
const normalizeResourceType = (resource) => {
  if (resource.id === 'res-aap' || resource.type === 'AAP' || /kortel/i.test(resource.title ?? '')) return 'Kortelė';
  return ({
    Testas: 'Testas', Testai: 'Testas',
    Žurnalas: 'Žurnalas', Žurnalai: 'Žurnalas',
    Kortelė: 'Kortelė', Kortelės: 'Kortelė',
    Protokolas: 'Protokolas', Protokolai: 'Protokolas',
    Mokymas: 'Protokolas', Mokymai: 'Protokolas',
  })[resource.type?.trim()] ?? 'Protokolas';
};

const initialData = {
  resourceTypes: defaultResourceTypes,
  organizations: [
    {
      id: 'org-statybu',
      name: 'UAB „Statybų ekspertai“',
      companyCode: '305123456',
      manager: 'Jonas Petraitis',
      managerPin: '',
      aapItems: defaultAapItems.map((item) => ({ ...item })),
      dss: ['spec-rasa'],
      dssInvitations: [],
      commission: ['Tomas Vaitkus', 'Rasa Kazlauskienė'],
      commissionPins: {},
      resources: ['res-fire', 'res-height', 'res-aap'],
    },
    {
      id: 'org-logistika',
      name: 'UAB „Logistikos centras“',
      companyCode: '302654321',
      manager: 'Mantas Jankauskas',
      managerPin: '',
      aapItems: defaultAapItems.map((item) => ({ ...item })),
      dss: ['spec-rasa'],
      dssInvitations: [],
      commission: ['Aistė Rimkutė'],
      commissionPins: {},
      resources: ['res-fire', 'res-chemical'],
    },
  ],
  employees: [
    { id: 'emp-jonas', orgId: 'org-statybu', name: 'Jonas Petraitis', email: 'jonas@imone.lt', position: 'Operatorius', contractNumber: 'DS-2026-001', status: 'Aktyvus', aapCompleted: true, resourceIds: ['res-fire', 'res-height', 'res-aap'], progressByResource: { 'res-height': 'started', 'res-aap': 'completed' }, sizes: { shoes: '43', clothes: 'L', pants: '50', jacket: 'L', height: '182', weight: '80', helmet: 'M' }, pin: '' },
    { id: 'emp-petras', orgId: 'org-statybu', name: 'Petras Petraitis', email: 'petras@imone.lt', position: 'Vairuotojas', contractNumber: 'DS-2026-002', status: 'Pakviestas', resourceIds: ['res-fire', 'res-aap'], progressByResource: {}, sizes: { shoes: '', clothes: '', pants: '', jacket: '', height: '', weight: '', helmet: '' }, pin: '' },
    { id: 'emp-rasa', orgId: 'org-statybu', name: 'Rasa Kazlauskienė', email: 'rasa@imone.lt', position: 'Sandėlininkė', contractNumber: 'DS-2025-018', status: 'Aktyvus', aapCompleted: true, resourceIds: ['res-fire', 'res-chemical'], progressByResource: {}, sizes: { shoes: '38', clothes: 'M', pants: '40', jacket: 'M', height: '168', weight: '62', helmet: 'S' }, pin: '' },
    { id: 'emp-mantas', orgId: 'org-logistika', name: 'Mantas Jankauskas', email: 'mantas@logistika.lt', position: 'Sandėlininkas', contractNumber: 'DS-2024-007', status: 'Aktyvus', aapCompleted: true, resourceIds: ['res-fire', 'res-chemical'], progressByResource: {}, sizes: { shoes: '42', clothes: 'L', pants: '48', jacket: 'L', height: '178', weight: '76', helmet: 'M' }, pin: '' },
  ],
  archivedEmployees: [],
  protocolBatches: [],
  aapIssuances: [],
  commissionAssignments: [],
  protocolCommissionSignatures: [],
  commissionInvitations: [],
  commissionTasks: [],
  specialists: [
    { id: 'spec-rasa', name: 'Rasa Norkienė', email: 'rasa.norkiene@dss.lt', status: 'Paskyra patvirtinta', pin: '' },
    { id: 'spec-mindaugas', name: 'Mindaugas Valaitis', email: 'mindaugas@dss.lt', status: 'Paskyra patvirtinta', pin: '' },
  ],
  resources: [
    { id: 'res-fire', title: 'Bendroji gaisrinė sauga', type: 'Testas', category: 'Priešgaisrinė sauga', image: '/courses/fire-response.jpg', duration: '15 min.', html: '<h2>Bendroji gaisrinė sauga</h2><p>Susipažinkite su evakuacijos tvarka, perspėjimo priemonėmis ir gesintuvų naudojimo pagrindais.</p>', signatures: true, validityMonths: 12, questions: [{ prompt: 'Ką daryti pirmiausia pastebėjus gaisrą?', options: ['Įspėti kitus ir skambinti 112', 'Slėpti įvykį'], correctIndex: 0 }, { prompt: 'Kada galima naudoti gesintuvą?', options: ['Kai tai saugu ir turite kelią pasitraukti', 'Bet kokiomis aplinkybėmis'], correctIndex: 0 }] },
    { id: 'res-height', title: 'Darbas aukštyje ir saugos diržai', type: 'Protokolas', category: 'Instruktavimas', image: '/courses/work-at-height.jpg', duration: '20 min.', html: '<h2>Darbas aukštyje</h2><p>Prieš darbą patikrinkite apsaugos nuo kritimo priemones ir tvirtinimo taškus.</p>', signatures: true, validityMonths: 12 },
    { id: 'res-chemical', title: 'Saugus darbas su chemikalais', type: 'Testas', category: 'Cheminė sauga', image: '/courses/chemical-response.jpg', duration: '15 min.', html: '<h2>Cheminė sauga</h2><p>Vadovaukitės saugos duomenų lapu ir naudokite nurodytas asmenines apsaugos priemones.</p>', signatures: true, validityMonths: 12, questions: [{ prompt: 'Kur rasti informaciją apie cheminės medžiagos rizikas?', options: ['Saugos duomenų lape', 'Tik ant pakuotės spalvos'], correctIndex: 0 }, { prompt: 'Ką daryti patekus cheminei medžiagai ant odos?', options: ['Laikytis saugos duomenų lapo nurodymų', 'Nieko nedaryti'], correctIndex: 0 }] },
    { id: workplaceConductTestId, title: 'Prieš psichologinį ir fizinį smurtą, diskriminaciją ir priekabiavimą nukreiptos mokymo programos testas', type: 'Testas', category: 'Smurto ir priekabiavimo prevencija', image: '/courses/safety-training.jpg', duration: '12 klausimų', html: '<h2>Psichologinio ir fizinio smurto, diskriminacijos bei priekabiavimo prevencija</h2><p>Atsakykite į visus 12 klausimų pasirinkdami vieną variantą. Testas išlaikomas surinkus ne mažiau kaip 80 %.</p>', signatures: true, validityMonths: 12, questions: workplaceConductQuestions },
    { id: chemicalSafetyTestId, title: 'Dirbančių su pavojingomis cheminėmis medžiagomis mokymo, atestavimo programa – testas', type: 'Testas', category: 'Cheminė sauga', image: '/courses/chemical-response.jpg', duration: '10 klausimų', html: '<h2>Dirbančių su pavojingomis cheminėmis medžiagomis mokymo, atestavimo programa</h2><p>Atsakykite į visus 10 klausimų. Kai kuriuose klausimuose gali būti keli teisingi variantai. Testas išlaikomas surinkus ne mažiau kaip 80 %.</p>', signatures: true, validityMonths: 12, questions: chemicalSafetyQuestions },
    { id: workAtHeightTestId, title: 'Darbuotojo, atliekančio darbus aukštyje mokymo programos testas', type: 'Testas', category: 'Darbas aukštyje', image: '/courses/work-at-height.jpg', duration: '18 klausimų', html: '<h2>Darbuotojo, atliekančio darbus aukštyje mokymo programa</h2><p>Atsakykite į visus 18 klausimų. Kai kuriuose klausimuose gali būti keli teisingi variantai. Testas išlaikomas surinkus ne mažiau kaip 80 %.</p>', signatures: true, validityMonths: 12, questions: workAtHeightQuestions },
    { id: excavationSafetyTestId, title: 'Grunto kasimo, tvirtinimo ir kiti darbai iškasose ir pylimuose – mokymų testas', type: 'Testas', category: 'Darbai iškasose ir pylimuose', image: '/courses/construction-ppe.jpg', duration: '12 klausimų', html: '<h2>Grunto kasimo, tvirtinimo ir kiti darbai iškasose ir pylimuose</h2><p>Atsakykite į visus 12 klausimų. Kiekviename klausime yra vienas teisingas variantas. Testas išlaikomas surinkus ne mažiau kaip 80 %.</p>', signatures: true, validityMonths: 12, questions: excavationSafetyQuestions },
    { id: fireKnowledgeTestId, title: 'Gaisrinės saugos žinių patikrinimo testas', type: 'Testas', category: 'Priešgaisrinė sauga', image: '/courses/fire-response.jpg', duration: '20 klausimų', html: '<h2>Gaisrinės saugos žinių patikrinimo testas</h2><p>Atsakykite į visus 20 klausimų pasirinkdami po vieną variantą. Testas išlaikomas surinkus ne mažiau kaip 80 %.</p>', signatures: true, validityMonths: 12, questions: fireKnowledgeQuestions },
    { id: manualHandlingTestId, title: 'Darbuotojų, atliekančių krovinių kėlimo rankomis darbus, mokymo programos testas', type: 'Testas', category: 'Krovinių kėlimas rankomis', image: '/courses/construction-ppe.jpg', duration: '19 klausimų', html: '<h2>Darbuotojų, atliekančių krovinių kėlimo rankomis darbus, mokymo programa</h2><p>Atsakykite į visus 19 klausimų. Kai kuriuose klausimuose gali būti keli teisingi variantai. Testas išlaikomas surinkus ne mažiau kaip 80 %.</p>', signatures: true, validityMonths: 12, questions: manualHandlingQuestions },
    { id: knowledgeAssessmentProtocolId, title: 'Mokymo programos žinių patikrinimo protokolas', type: 'Protokolas', category: 'Mokymo programos', duration: 'A4 formatas', html: knowledgeAssessmentProtocolTemplate, templateKind: 'knowledge-assessment-protocol', signatures: true, validityMonths: 12, requiredSigners: ['Darbuotojas', 'DSS specialistas'], isProtocolTemplate: true },
    ...defaultCompanyProtocolTemplates.map(({ id, title, testId }) => ({ id, title, type: 'Protokolas', category: 'Mokymo programos', duration: 'A4 formatas', html: knowledgeAssessmentProtocolTemplate, templateKind: 'knowledge-assessment-protocol', relatedTestId: testId, signatures: true, validityMonths: 12, requiredSigners: ['Darbuotojas', 'DSS specialistas'], isProtocolTemplate: true })),
    { id: 'res-journal', title: 'Įvadinio instruktavimo žurnalas', type: 'Žurnalas', category: 'DSS dokumentai', image: '/courses/employee-orientation.jpg', duration: '10 min.', html: '<h2>Įvadinis instruktavimas</h2><p>Darbuotojas patvirtina, kad susipažino su įmonės saugos reikalavimais.</p>', signatures: true, validityMonths: 12 },
    { id: jobDescriptionJournalId, title: 'Darbuotojų, supažindintų su pareiginiais nuostatais, registracijos žurnalas', type: 'Žurnalas', category: 'Darbuotojų supažindinimas', duration: '15 įrašų', html: jobDescriptionFamiliarizationTemplate, templateKind: 'job-description-journal', requiredSigners: ['Darbuotojas'], defaultSettings: { rowCount: 15, populateEmployees: true, regulationNumber: '' } },
    { id: 'res-familiarization-card', title: 'Darbuotojų supažindinimo kortelė', type: 'Kortelė', category: 'Darbuotojų supažindinimas', image: '/courses/safety-training.jpg', duration: '20 darbuotojų', html: employeeFamiliarizationTemplate, templateKind: 'familiarization-card', requiredSigners: ['Darbuotojas', 'DSS specialistas'], defaultSettings: { rowCount: 20, populateEmployees: true, date: '', instructorName: '' } },
    { id: 'res-workplace-dss-journal', title: 'DSS instruktavimų darbo vietoje žurnalas', type: 'Žurnalas', category: 'Instruktavimas darbo vietoje', image: '/courses/construction-ppe.jpg', duration: '15 įrašų', html: workplaceInstructionsTemplate, templateKind: 'workplace-dss-journal', requiredSigners: ['Darbuotojas', 'DSS specialistas'], defaultSettings: { rowCount: 15, populateEmployees: true, date: '', instructionNumber: '', instructionTitle: '', instructorName: '', instructorPosition: '' } },
    { id: 'res-intro-dss-journal', title: 'Įvadinių instruktavimų registravimo žurnalas', type: 'Žurnalas', category: 'Įvadinis instruktavimas', image: '/courses/safety-ergonomics.jpg', duration: '15 įrašų', html: introInstructionsTemplate, templateKind: 'intro-dss-journal', requiredSigners: ['Darbuotojas', 'DSS specialistas'], defaultSettings: { rowCount: 15, populateEmployees: true, date: '', instructorName: '', instructorPosition: '' } },
    { id: 'res-work-rules-journal', title: 'Darbo tvarkos taisyklių supažindinimo žurnalas', type: 'Žurnalas', category: 'Darbo tvarkos taisyklės', image: '/courses/safety-standdown.jpg', duration: '15 darbuotojų', html: workRulesTemplate, templateKind: 'work-rules-journal', requiredSigners: ['Darbuotojas'], defaultSettings: { rowCount: 15, populateEmployees: true, date: '' } },
    { id: internalDocumentsRegisterId, title: 'Darbuotojų supažindinimo su įmonės vidaus norminiais dokumentais registracijos žurnalas', type: 'Žurnalas', category: 'Įmonės vidaus dokumentai', duration: '12 darbuotojų', html: internalDocumentsRegisterTemplate, templateKind: 'internal-documents-register', requiredSigners: ['Darbuotojas'], defaultSettings: { rowCount: 12, populateEmployees: true } },
    { id: 'res-fire-safety-journal', title: 'Gaisrinės saugos instrukcijų registracijos žurnalas', type: 'Žurnalas', category: 'Priešgaisrinė sauga', image: '/courses/fire-extinguisher.jpg', duration: '15 įrašų', html: fireSafetyJournalTemplate, templateKind: 'fire-safety-journal', requiredSigners: ['DSS specialistas'], defaultSettings: { rowCount: 15, populateEmployees: false, date: '', instructionNumber: '', instructionTitle: '', instructorName: '', changedInstruction: '' } },
    { id: chemicalSafetyInstructionCardId, title: 'Darbuotojų saugos ir sveikatos instruktavimų registravimo kortelė', type: 'Kortelė', category: 'Cheminė sauga', duration: '20 darbuotojų', html: chemicalSafetyInstructionCardTemplate, templateKind: 'chemical-safety-instruction-card', relatedTestId: chemicalSafetyTestId, requiredSigners: ['Darbuotojas', 'DSS specialistas'], defaultSettings: { rowCount: 20, populateEmployees: true } },
    { id: 'res-aap', title: 'AAP išdavimo kortelė', type: 'Kortelė', category: 'Asmeninės apsaugos priemonės', image: '/courses/aap-equipment.jpg', duration: '5 min.', html: aapTemplate, requiredSigners: ['Darbuotojas', 'Vadovas'], signatures: true, validityMonths: 12 },
  ],
  signatures: [
    { id: 'sig-seed-1', orgId: 'org-statybu', employeeId: 'emp-jonas', resourceId: 'res-fire', signer: 'Jonas Petraitis', role: 'Darbuotojas', signedAt: '2026-10-12T14:20:00', validUntil: '2027-10-12T14:20:00', ip: '127.0.0.1 (demo)' },
    { id: 'sig-seed-2', orgId: 'org-statybu', employeeId: 'emp-rasa', resourceId: 'res-journal', signer: 'Rasa Kazlauskienė', role: 'Darbuotojas', signedAt: '2026-10-13T09:15:00', validUntil: '2027-10-13T09:15:00', ip: '127.0.0.1 (demo)' },
  ],
  subscriptions: [
    { id: 'sub-statybu', orgId: 'org-statybu', plan: 'Pro', status: 'Aktyvi', price: 79, endsAt: '2026-11-12' },
    { id: 'sub-logistika', orgId: 'org-logistika', plan: 'Standartinis', status: 'Pasibaigusi', price: 29, endsAt: '2026-09-30' },
  ],
};

function createInitialCloudWorkspace(organization, managerName = '') {
  const organizationTemplate = initialData.organizations[0];
  const cloudOrganization = {
    ...organizationTemplate,
    id: organization.id,
    name: organization.name,
    companyCode: organization.company_code ?? '',
    manager: managerName,
    managerPin: '',
    commission: [],
    commissionPins: {},
    dss: [],
    dssInvitations: [],
    employeeAssignmentPresets: [],
    resourceSettings: {},
    resources: initialData.resources.map((resource) => resource.id),
  };

  return {
    ...initialData,
    organizations: [cloudOrganization],
    employees: [],
    archivedEmployees: [],
    protocolBatches: [],
    specialists: [],
    signatures: [],
    subscriptions: [],
    resources: initialData.resources.map((resource) => ({ ...resource, type: normalizeResourceType(resource) })),
  };
}

const preservedUserResourceIds = new Set([
  workplaceConductTestId,
  chemicalSafetyTestId,
  workAtHeightTestId,
  excavationSafetyTestId,
  fireKnowledgeTestId,
  manualHandlingTestId,
  knowledgeAssessmentProtocolId,
  ...defaultCompanyProtocolTemplates.map(({ id }) => id),
]);
const assistantCreatedResourceIds = new Set(initialData.resources
  .filter((resource) => !resource.templateKind && resource.id !== 'res-aap' && !preservedUserResourceIds.has(resource.id))
  .map((resource) => resource.id));

const roleLabels = { darbuotojas: 'Darbuotojas', dss: 'DSS specialistas', vadovas: 'Įmonės vadovas', kurejas: 'Turinio kūrėjas' };
const roleNavigation = {
  darbuotojas: [['uzduotys', 'Mano užduotys', BookOpen], ['aap', 'Mano AAP dydžiai', Shirt], ['parasai', 'Mano parašai', FileSignature], ['paskyra', 'Paskyra ir PIN', KeyRound]],
  dss: [['skydelis', 'Skydelis', LayoutDashboard], ['zurnalai', 'Pasirašomi žurnalai', FileText], ['parasai', 'Mano parašai', FileSignature], ['paskyra', 'Paskyra ir PIN', KeyRound]],
  vadovas: [['skydelis', 'Skydelis', LayoutDashboard], ['ataskaitos', 'Ataskaitos', FileText], ['biblioteka', 'Biblioteka', BookOpen], ['archyvas', 'Archyvas', Archive], ['imone', 'Įmonės nustatymai', Building2]],
  kurejas: [['skydelis', 'Skydelis', LayoutDashboard], ['imones', 'Įmonės', Building2], ['paskyros', 'Paskyros', Users], ['biblioteka', 'Turinio biblioteka', BookOpen], ['prenumeratos', 'Prenumeratų valdymas', CreditCard]],
};

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return {
      ...initialData,
      resources: initialData.resources.filter((resource) => !assistantCreatedResourceIds.has(resource.id)).map((resource) => ({ ...resource, type: normalizeResourceType(resource) })),
      organizations: initialData.organizations.map((org) => ({ ...org, resources: org.resources.filter((id) => !assistantCreatedResourceIds.has(id)) })),
      employees: initialData.employees.map((employee) => ({ ...employee, resourceIds: employee.resourceIds.filter((id) => !assistantCreatedResourceIds.has(id)) })),
    };
    const parsed = JSON.parse(saved);
    const savedResources = (parsed.resources ?? initialData.resources).filter((resource) => !assistantCreatedResourceIds.has(resource.id));
    const resourceTypes = defaultResourceTypes;
    const restoredUserResources = initialData.resources.filter((resource) => !assistantCreatedResourceIds.has(resource.id) && !savedResources.some((savedResource) => savedResource.id === resource.id));
    const resources = [...savedResources, ...restoredUserResources].map((resource) => {
      const defaults = initialData.resources.find((item) => item.id === resource.id);
      const mergedResource = { ...defaults, ...resource };
      const sourceTemplate = initialData.resources.find((item) => item.id === resource.sourceResourceId);
      const protocolMetadata = mergedResource.type === 'Protokolas' && mergedResource.html?.includes('protocol-table')
        ? { templateKind: 'knowledge-assessment-protocol', relatedTestId: mergedResource.relatedTestId ?? sourceTemplate?.relatedTestId }
        : {};
      return { ...mergedResource, ...protocolMetadata, type: normalizeResourceType(mergedResource), image: resource.image ?? defaults?.image, html: resource.html ?? defaults?.html, requiredSigners: resource.id === 'res-aap' ? ['Darbuotojas', 'Vadovas'] : resource.requiredSigners ?? defaults?.requiredSigners, questions: resource.questions ?? defaults?.questions ?? [] };
    });
    const employees = (parsed.employees ?? initialData.employees).map((employee) => {
      const defaults = initialData.employees.find((item) => item.id === employee.id);
      const savedProgress = employee.progressByResource ?? {};
      return {
        ...defaults,
        ...employee,
        resourceIds: (employee.resourceIds ?? defaults?.resourceIds ?? []).filter((id) => !assistantCreatedResourceIds.has(id)),
        position: employee.position?.trim() || defaults?.position || 'Darbuotojas',
        contractNumber: employee.contractNumber ?? defaults?.contractNumber ?? '',
        progressByResource: Object.keys(savedProgress).length ? savedProgress : defaults?.progressByResource ?? {},
        testResults: Array.isArray(employee.testResults) ? employee.testResults : [],
      };
    });
    const organizations = (parsed.organizations ?? initialData.organizations).map((org) => ({
      ...org,
      resources: (org.resources ?? []).filter((id) => !assistantCreatedResourceIds.has(id)),
      managerPin: org.managerPin ?? '',
      commissionPins: org.commissionPins ?? {},
      resourceSettings: org.resourceSettings ?? {},
      aapItems: (org.aapItems ?? defaultAapItems).map((item) => ({ ...defaultAapItems.find((defaultItem) => defaultItem.id === item.id), ...item, code: item.code ?? '' })),
      employeeAssignmentPresets: Array.isArray(org.employeeAssignmentPresets) ? org.employeeAssignmentPresets : [],
      dssInvitations: org.dssInvitations ?? [],
    }));
    const signatures = (parsed.signatures ?? initialData.signatures).map((signature) => {
      const defaults = initialData.signatures.find((item) => item.id === signature.id);
      const resource = resources.find((item) => item.id === signature.resourceId);
      const employee = employees.find((item) => item.id === signature.employeeId);
      const org = organizations.find((item) => item.id === signature.orgId);
      const aapSnapshot = signature.aapSnapshot ?? (resource?.id === 'res-aap' && signature.role === 'Darbuotojas' ? createAapSnapshot(employee, org) : undefined);
      return { ...defaults, ...signature, contractNumber: signature.contractNumber ?? employee?.contractNumber ?? '', aapSnapshot, validUntil: signature.validUntil ?? defaults?.validUntil ?? getValidityUntilFrom(signature.signedAt, resource?.validityMonths) };
    });
    return { ...initialData, ...parsed, resourceTypes, resources, employees, organizations, signatures, archivedEmployees: parsed.archivedEmployees ?? [] };
  } catch {
    return {
      ...initialData,
      resources: initialData.resources.filter((resource) => !assistantCreatedResourceIds.has(resource.id)).map((resource) => ({ ...resource, type: normalizeResourceType(resource) })),
      organizations: initialData.organizations.map((org) => ({ ...org, resources: org.resources.filter((id) => !assistantCreatedResourceIds.has(id)) })),
      employees: initialData.employees.map((employee) => ({ ...employee, resourceIds: employee.resourceIds.filter((id) => !assistantCreatedResourceIds.has(id)) })),
    };
  }
}

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40';
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';
const signerRoleOptions = [
  { value: 'Darbuotojas', label: 'Darbuotojas' },
  { value: 'Vadovas', label: 'Įmonės vadovas' },
  { value: 'DSS specialistas', label: 'DSS specialistas' },
  { value: 'Komisijos narys', label: 'Komisijos nariai' },
];
const resourceStatusOrder = { signed: 0, awaitingDss: 1, awaitingEmployer: 1, awaitingCommission: 1, awaitingSignatures: 1, started: 2, unsigned: 3, todo: 4, expired: 5 };
const employeePageSize = 20;
const signatureHistoryPageSize = 25;

export default function LocalWorkspace({ userRole, onRoleChange, onExit, initialCloudData = null, creatorCatalog = null, creatorAccounts = [], onCreatorPreview = () => {}, onLoadDssOrganization = null, onRefreshWorkspace = async () => null, creatorReadOnlyPreview = '', onExitCreatorPreview = () => {}, onCreatorWorkspaceChanged = async () => {}, onCreatorOrganizationDeleted = async () => {}, cloudOrganization = null, cloudManagerName = '', cloudMode = false, cloudUserId = '' }) {
  const [validityCheckTime, setValidityCheckTime] = useState(Date.now);
  const [data, setData] = useState(() => {
    const loadedData = initialCloudData
      ? { ...initialData, ...initialCloudData }
      : cloudMode && cloudOrganization ? createInitialCloudWorkspace(cloudOrganization, cloudManagerName) : loadData();
    const workspaceData = {
      ...loadedData,
      organizations: (loadedData.organizations ?? []).map((organization) => ({
        ...initialData.organizations[0],
        ...organization,
        commission: organization.commission ?? [],
        commissionPins: organization.commissionPins ?? {},
        dss: organization.dss ?? [],
        dssInvitations: organization.dssInvitations ?? [],
        employeeAssignmentPresets: organization.employeeAssignmentPresets ?? [],
        resourceSettings: organization.resourceSettings ?? {},
        resources: organization.resources ?? [],
        aapItems: organization.aapItems ?? defaultAapItems,
      })),
      employees: loadedData.employees.map((employee) => ({
        ...employee,
        medicalCertificateReminderDate: getMedicalCertificateReminderDate(employee.medicalCertificateValidUntil),
      })),
    };
    if (!cloudMode || !creatorCatalog) return workspaceData;

    const resourcesById = new Map(workspaceData.resources.map((resource) => [resource.id, resource]));
    for (const resource of creatorCatalog.resources ?? []) {
      if (!resource.organizationId) resourcesById.set(resource.id, resource);
    }
    for (const resource of workspaceData.resources) {
      if (resource.organizationId) resourcesById.set(resource.id, resource);
    }
    return {
      ...workspaceData,
      resources: [...resourcesById.values()],
      resourceTypes: creatorCatalog.resourceTypes ?? workspaceData.resourceTypes,
    };
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(userRole === 'darbuotojas' ? 'uzduotys' : 'skydelis');
  const [selectedOrgId, setSelectedOrgId] = useState(initialCloudData?.organizations[0]?.id ?? cloudOrganization?.id ?? (cloudMode ? '' : 'org-statybu'));
  const [dssWorkspaceLoadState, setDssWorkspaceLoadState] = useState({ organizationId: '', status: 'idle', error: '' });
  const [dssWorkspaceLoadAttempt, setDssWorkspaceLoadAttempt] = useState(0);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialCloudData?.employees[0]?.id ?? (cloudMode ? '' : 'emp-jonas'));
  const [selectedSpecialistId, setSelectedSpecialistId] = useState(initialCloudData?.specialists[0]?.id ?? (cloudMode ? '' : 'spec-rasa'));
  const [notice, setNotice] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const [libraryTypeFilter, setLibraryTypeFilter] = useState('visos');
  const [librarySearch, setLibrarySearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [creatorOrganizationSearch, setCreatorOrganizationSearch] = useState('');
  const [creatorAccountSearch, setCreatorAccountSearch] = useState('');
  const [creatorOrganizationPage, setCreatorOrganizationPage] = useState(1);
  const [creatorAccountPage, setCreatorAccountPage] = useState(1);
  const [employeeSort, setEmployeeSort] = useState({ key: 'resource-type:Kortelė', direction: 'asc' });
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeDetailsId, setEmployeeDetailsId] = useState(null);
  const [aapIssueEmployeeId, setAapIssueEmployeeId] = useState(null);
  const [aapIssueSelectedItemIds, setAapIssueSelectedItemIds] = useState([]);
  const [aapIssueQuantities, setAapIssueQuantities] = useState({});
  const [aapIssueDate, setAapIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [aapIssueIssuer, setAapIssueIssuer] = useState('');
  const [aapIssueSigningTarget, setAapIssueSigningTarget] = useState(null);
  const [aapIssueSignError, setAapIssueSignError] = useState('');
  const [aapIssueSignSubmitting, setAapIssueSignSubmitting] = useState(false);
  const [archiveDetailsId, setArchiveDetailsId] = useState(null);
  const [archivePrintMode, setArchivePrintMode] = useState(null);
  const [reportTypeFilter, setReportTypeFilter] = useState('visos');
  const [reportAapSearch, setReportAapSearch] = useState('');
  const [protocolSearch, setProtocolSearch] = useState('');
  const [protocolProgramFilter, setProtocolProgramFilter] = useState('visos');
  const [protocolStatusFilter, setProtocolStatusFilter] = useState('visos');
  const [protocolPage, setProtocolPage] = useState(1);
  const [reportTestTargetId, setReportTestTargetId] = useState(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [employeeAssignmentSaving, setEmployeeAssignmentSaving] = useState(false);
  const [employeeResourceDraft, setEmployeeResourceDraft] = useState([]);
  const [employeeSignerDraft, setEmployeeSignerDraft] = useState({});
  const [taskFilter, setTaskFilter] = useState('atliktinos');
  const [taskSearch, setTaskSearch] = useState('');
  const [specialistQuery, setSpecialistQuery] = useState('');
  const [employeeForm, setEmployeeForm] = useState({ firstName: '', lastName: '', email: '', contractNumber: '', position: '', medicalCertificateValidUntil: '' });
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [dssInvitationActionId, setDssInvitationActionId] = useState('');
  const [dssRevokeSubmittingId, setDssRevokeSubmittingId] = useState('');
  const [dssRefreshSubmitting, setDssRefreshSubmitting] = useState(false);
  const [employeePositionDraft, setEmployeePositionDraft] = useState('');
  const [inviteResourceIds, setInviteResourceIds] = useState(['res-fire', 'res-height', 'res-aap']);
  const [selectedAssignmentPresetId, setSelectedAssignmentPresetId] = useState('');
  const [assignmentPresetDraft, setAssignmentPresetDraft] = useState({ id: '', name: '', resourceIds: [] });
  const [aapDraft, setAapDraft] = useState(() => initialCloudData?.organizations[0]?.aapItems ?? defaultAapItems);
  const [resourceForm, setResourceForm] = useState({ title: '', type: 'Testas', category: '', image: '', html: '', validityMonths: 12, requiredSigners: ['Darbuotojas'] });
  const [resourceFileUploading, setResourceFileUploading] = useState(false);
  const [resourceSaving, setResourceSaving] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [protocolSource, setProtocolSource] = useState(null);
  const [protocolTitle, setProtocolTitle] = useState('');
  const [resourceSettingsTarget, setResourceSettingsTarget] = useState(null);
  const [resourceSettingsDraft, setResourceSettingsDraft] = useState({});
  const [draftQuestions, setDraftQuestions] = useState([{ prompt: '', options: ['', ''], correctIndex: 0 }]);
  const [previewResource, setPreviewResource] = useState(null);
  const creatorSaveQueue = useRef(Promise.resolve());
  const workspaceAutosaveTimeoutRef = useRef(null);
  const workspaceAutosaveRequestRef = useRef(Promise.resolve());
  const skipNextWorkspaceAutosaveRef = useRef(false);
  const employeeAssignmentRpcInFlightRef = useRef(false);
  const previewFrameRef = useRef(null);
  const archiveDownloadModeRef = useRef(null);
  const resourceHtmlCacheRef = useRef(new Map());
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [readConfirmed, setReadConfirmed] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [workerCurrentPin, setWorkerCurrentPin] = useState('');
  const [managerPinDraft, setManagerPinDraft] = useState('');
  const [managerPinConfirm, setManagerPinConfirm] = useState('');
  const [managerCurrentPin, setManagerCurrentPin] = useState('');
  const [employerSigningTarget, setEmployerSigningTarget] = useState(null);
  const [employerSignPin, setEmployerSignPin] = useState('');
  const [employerSignError, setEmployerSignError] = useState('');
  const [commissionSigningTarget, setCommissionSigningTarget] = useState(null);
  const [commissionSignPin, setCommissionSignPin] = useState('');
  const [commissionSignError, setCommissionSignError] = useState('');
  const [commissionPinStatus, setCommissionPinStatus] = useState({ organizationId: null, members: {} });
  const [commissionInvitationTarget, setCommissionInvitationTarget] = useState(null);
  const [protocolCommissionTaskTarget, setProtocolCommissionTaskTarget] = useState(null);
  const [commissionConsentChecked, setCommissionConsentChecked] = useState(false);
  const [commissionActionSubmitting, setCommissionActionSubmitting] = useState(false);
  const [commissionActionError, setCommissionActionError] = useState('');
  const [dssSigningTasks, setDssSigningTasks] = useState([]);
  const [signPinDraft, setSignPinDraft] = useState('');
  const [dssSigningError, setDssSigningError] = useState('');
  const [dssReviewConfirmed, setDssReviewConfirmed] = useState(false);
  const [selectedDssTaskIds, setSelectedDssTaskIds] = useState([]);
  const [workerSigningTarget, setWorkerSigningTarget] = useState(null);
  const [workerSignPin, setWorkerSignPin] = useState('');
  const [workerSignError, setWorkerSignError] = useState('');
  const [signatureInk, setSignatureInk] = useState('');

  useEffect(() => {
    if (!previewResource) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewResource]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeoutId = window.setTimeout(() => setValidityCheckTime(Date.now()), nextMidnight.getTime() - now.getTime());
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') setValidityCheckTime(Date.now());
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [validityCheckTime]);

  useEffect(() => {
    if (!cloudMode || userRole !== 'dss' || !onLoadDssOrganization || !selectedOrgId) return undefined;
    let active = true;
    onLoadDssOrganization(selectedOrgId).then(({ organization, data: organizationData }) => {
      if (!active) return;
      setData((current) => ({
        ...current,
        organizations: current.organizations.map((item) => item.id === selectedOrgId ? organization : item),
        employees: (organizationData.employees ?? []).map((employee) => ({
          ...employee,
          medicalCertificateReminderDate: getMedicalCertificateReminderDate(employee.medicalCertificateValidUntil),
        })),
        archivedEmployees: organizationData.archivedEmployees ?? [],
        protocolBatches: organizationData.protocolBatches ?? [],
        commissionAssignments: organizationData.commissionAssignments ?? [],
        protocolCommissionSignatures: organizationData.protocolCommissionSignatures ?? [],
        signatures: organizationData.signatures ?? [],
        resources: organizationData.resources ?? current.resources,
      }));
      setDssWorkspaceLoadState({ organizationId: selectedOrgId, status: 'ready', error: '' });
    }).catch((error) => {
      if (!active) return;
      setDssWorkspaceLoadState({ organizationId: selectedOrgId, status: 'error', error: error.message });
    });
    return () => { active = false; };
  }, [cloudMode, userRole, onLoadDssOrganization, selectedOrgId, dssWorkspaceLoadAttempt]);

  const saveCreatorWorkspaceSnapshot = (workspaceData) => {
    const saveRequest = creatorSaveQueue.current.catch(() => {}).then(async () => {
      const { error } = await supabase.rpc('save_creator_workspace', {
        input_resources: workspaceData.resources.filter((resource) => !resource.organizationId).map(resourceForDatabase),
        input_resource_types: workspaceData.resourceTypes,
        input_subscriptions: workspaceData.subscriptions,
      });
      if (error) throw error;
    });
    creatorSaveQueue.current = saveRequest.catch(() => {});
    return saveRequest;
  };

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!cloudMode) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return undefined;
    }

    if (!cloudUserId) return undefined;

    if (userRole === 'kurejas') {
      saveCreatorWorkspaceSnapshot(data).catch((error) => setNotice(`Kūrėjo duomenų išsaugoti nepavyko: ${error.message}`));
      return undefined;
    }

    if (userRole === 'darbuotojas') {
      const employee = data.employees.find((item) => item.orgId === selectedOrgId);
      if (!employee) return undefined;
      const assignedResourceIds = new Set(employee.resourceIds ?? []);
      const inputProgress = Object.fromEntries(Object.entries(employee.progressByResource ?? {}).filter(([resourceId]) => assignedResourceIds.has(resourceId)));
      const timeout = window.setTimeout(async () => {
        const { error } = await supabase.rpc('save_employee_workspace', {
          input_sizes: employee.sizes ?? {},
          input_progress: inputProgress,
        });
        if (error) setNotice(`Darbuotojo duomenų išsaugoti nepavyko: ${error.message}`);
      }, 500);

      return () => window.clearTimeout(timeout);
    }

    if (userRole === 'dss') return undefined;

    const organization = data.organizations.find((item) => item.id === selectedOrgId);
    if (!organization) return undefined;

    if (skipNextWorkspaceAutosaveRef.current) {
      skipNextWorkspaceAutosaveRef.current = false;
      return undefined;
    }

    const saveWorkspaceSnapshot = async () => {
      if (employeeAssignmentRpcInFlightRef.current) {
        workspaceAutosaveTimeoutRef.current = window.setTimeout(saveWorkspaceSnapshot, 500);
        return;
      }
      if (skipNextWorkspaceAutosaveRef.current) {
        workspaceAutosaveTimeoutRef.current = null;
        return;
      }
      workspaceAutosaveTimeoutRef.current = null;
      const saveRequest = supabase.from('organization_data').upsert({
          organization_id: organization.id,
          data: workspaceForDatabase(data),
          updated_by: cloudUserId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' });
      workspaceAutosaveRequestRef.current = Promise.resolve(saveRequest)
        .then(({ error }) => {
          if (error) {
            setNotice(`Cloud duomenų išsaugoti nepavyko: ${error.message}`);
            return error;
          }
          return null;
        })
        .catch((error) => {
          setNotice(`Cloud duomenų išsaugoti nepavyko: ${error.message}`);
          return error;
        });
      await workspaceAutosaveRequestRef.current;
    };
    const timeout = window.setTimeout(saveWorkspaceSnapshot, 500);
    workspaceAutosaveTimeoutRef.current = timeout;

    return () => {
      window.clearTimeout(timeout);
      if (workspaceAutosaveTimeoutRef.current === timeout) workspaceAutosaveTimeoutRef.current = null;
    };
  }, [data, cloudMode, cloudUserId, selectedOrgId, userRole, creatorReadOnlyPreview]);

  useLayoutEffect(() => {
    const frame = previewFrameRef.current;
    if (frame) {
      frame.hidden = userRole === 'darbuotojas' && previewResource?.type === 'Testas';
      frame.closest('section')?.classList.toggle('worker-signed-preview', Boolean(previewResource?.workerSignedPreview));
    }
  }, [previewResource, userRole]);

  useEffect(() => {
    if (!archivePrintMode) return undefined;
    if (archiveDownloadModeRef.current === archivePrintMode) return undefined;
    archiveDownloadModeRef.current = archivePrintMode;
    const target = document.querySelector(archivePrintMode === 'all' ? '.archive-print-all' : '.archive-print-target');
    if (!target) {
      archiveDownloadModeRef.current = null;
      return undefined;
    }
    const title = target.querySelector('h1, h2')?.textContent?.trim() || 'Darbuotoju_archyvas';
    printPdfHtml(createArchivePdfHtml(target), title)
      .catch((error) => setNotice(`Archyvo PDF atsisiųsti nepavyko: ${error.message}`))
      .finally(() => {
        archiveDownloadModeRef.current = null;
        setArchivePrintMode(null);
      });
    return undefined;
  }, [archivePrintMode]);

  useEffect(() => {
    if (!cloudMode || !selectedOrgId || userRole !== 'vadovas') return undefined;
    let active = true;
    supabase.rpc('get_commission_signer_status', { input_organization_id: selectedOrgId })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setNotice(`Komisijos PIN būsenos įkelti nepavyko: ${error.message}`);
        else setCommissionPinStatus({ organizationId: selectedOrgId, members: data ?? {} });
      });
    return () => { active = false; };
  }, [cloudMode, selectedOrgId, userRole]);

  useEffect(() => {
    if (!cloudMode || !selectedOrgId || userRole !== 'vadovas') return undefined;
    let active = true;
    let requestInFlight = false;
    const refreshCommissionAssignments = async () => {
      if (requestInFlight || document.visibilityState === 'hidden') return;
      requestInFlight = true;
      try {
        const { data: assignments, error } = await supabase.rpc('get_organization_commission_assignments', {
          input_organization_id: selectedOrgId,
        });
        if (error) throw error;
        if (active) {
          setData((current) => ({
            ...current,
            commissionAssignments: [
              ...(current.commissionAssignments ?? []).filter((assignment) => assignment.organizationId !== selectedOrgId),
              ...(assignments ?? []),
            ],
          }));
        }
      } catch (error) {
        if (active) setNotice(`Komisijos pranešimų atnaujinti nepavyko: ${error.message}`);
      } finally {
        requestInFlight = false;
      }
    };
    const intervalId = window.setInterval(refreshCommissionAssignments, 30_000);
    document.addEventListener('visibilitychange', refreshCommissionAssignments);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshCommissionAssignments);
    };
  }, [cloudMode, selectedOrgId, userRole]);

  const currentOrg = data.organizations.find((org) => org.id === selectedOrgId) ?? data.organizations[0];
  const currentEmployee = data.employees.find((employee) => employee.id === selectedEmployeeId) ?? data.employees.find((employee) => employee.orgId === selectedOrgId) ?? data.employees[0];
  const currentSpecialist = data.specialists.find((person) => person.id === selectedSpecialistId) ?? data.specialists[0];
  const pendingCommissionInvitations = (data.commissionInvitations ?? []).filter((invitation) => invitation.status === 'pending' && (!currentEmployee || invitation.employeeId === currentEmployee.id));
  const commissionProtocolTasks = cloudMode
    ? (data.commissionTasks ?? []).filter((task) => !currentEmployee || task.employeeId === currentEmployee.id)
    : (data.commissionAssignments ?? [])
      .filter((assignment) => assignment.organizationId === currentEmployee?.orgId && assignment.employeeId === currentEmployee?.id && assignment.status === 'accepted')
      .flatMap((assignment) => (data.protocolBatches ?? [])
        .filter((batch) => batch.orgId === assignment.organizationId && batch.protocolDate && batch.employeeIds?.length
          && assignment.respondedAt
          && new Date(assignment.respondedAt).toISOString().slice(0, 10) <= batch.protocolDate)
        .map((batch) => {
          const resource = data.resources.find((item) => item.id === batch.resourceId && item.templateKind === 'knowledge-assessment-protocol');
          if (!resource) return null;
          const allPassed = !resource.relatedTestId || batch.employeeIds.every((employeeId) => data.employees
            .find((item) => item.id === employeeId)
            ?.testResults?.some((result) => result.resourceId === resource.relatedTestId && result.passed));
          if (!allPassed) return null;
          const signatures = (data.protocolCommissionSignatures ?? []).filter((signature) => signature.batchId === batch.id);
          return {
            assignmentId: assignment.id,
            employeeId: assignment.employeeId,
            role: assignment.role,
            batchId: batch.id,
            batchNumber: batch.number,
            protocolDate: batch.protocolDate,
            resourceId: resource.id,
            resourceTitle: resource.title,
            hasSigned: signatures.some((signature) => signature.assignmentId === assignment.id),
            employeeNames: batch.employeeIds.map((employeeId) => data.employees.find((item) => item.id === employeeId)?.name).filter(Boolean),
            commissionAssignments: (data.commissionAssignments ?? []).filter((item) => item.organizationId === assignment.organizationId && item.status === 'accepted'),
            protocolCommissionSignatures: signatures,
          };
        })
        .filter(Boolean));
  const pendingCommissionTasks = commissionProtocolTasks.filter((task) => !task.hasSigned);
  const completedCommissionTasks = commissionProtocolTasks.filter((task) => task.hasSigned);
  const currentCommissionAssignments = useMemo(() => (data.commissionAssignments ?? []).filter((assignment) => assignment.organizationId === currentOrg?.id), [data.commissionAssignments, currentOrg?.id]);
  const orgEmployees = useMemo(() => data.employees.filter((employee) => employee.orgId === currentOrg?.id), [data.employees, currentOrg?.id]);
  const archivedOrgEmployees = useMemo(() => (data.archivedEmployees ?? []).filter((record) => record.orgId === currentOrg?.id), [data.archivedEmployees, currentOrg?.id]);
  const archiveDetailRecord = archivedOrgEmployees.find((record) => record.id === archiveDetailsId);
  const reportEmployees = useMemo(() => [...orgEmployees, ...archivedOrgEmployees.map((record) => record.employee)], [orgEmployees, archivedOrgEmployees]);
  const selectedOrgResources = useMemo(() => data.resources.filter((resource) => currentOrg?.resources.includes(resource.id)), [data.resources, currentOrg?.resources]);
  const reportSignatures = useMemo(() => data.signatures.filter((signature) => signature.orgId === currentOrg?.id && currentOrg?.resources.includes(signature.resourceId) && (reportTypeFilter === 'visos' || data.resources.find((resource) => resource.id === signature.resourceId)?.type === reportTypeFilter)), [data.signatures, currentOrg?.id, currentOrg?.resources, reportTypeFilter, data.resources]);
  const reportResourceGroups = ['Žurnalas', 'Kortelė', 'Protokolas']
    .filter((type) => reportTypeFilter === 'visos' || reportTypeFilter === type)
    .map((type) => ({
      type,
      title: resourceTypeDisplayNames[type],
      resources: selectedOrgResources.filter((resource) => resource.type === type && resource.id !== 'res-aap' && !(type === 'Protokolas' && resource.templateKind === 'knowledge-assessment-protocol')),
    }))
    .filter((group) => group.type !== 'Protokolas' || group.resources.length > 0);
  const reportProtocolGroups = reportResourceGroups.filter((group) => group.type === 'Protokolas');
  const reportJournalGroups = reportResourceGroups.filter((group) => group.type === 'Žurnalas');
  const reportCardGroups = reportResourceGroups.filter((group) => group.type === 'Kortelė');
  const reportAapResource = selectedOrgResources.find((resource) => resource.id === 'res-aap');
  const reportAapEmployees = useMemo(() => reportEmployees.filter((employee) => employee.resourceIds?.includes('res-aap')), [reportEmployees]);
  const filteredReportAapEmployees = useMemo(() => reportAapEmployees
    .filter((employee) => `${employee.name} ${employee.contractNumber ?? ''} ${employee.position ?? ''}`.toLocaleLowerCase('lt').includes(reportAapSearch.trim().toLocaleLowerCase('lt')))
    .sort((left, right) => left.name.localeCompare(right.name, 'lt')), [reportAapEmployees, reportAapSearch]);
  const protocolResources = selectedOrgResources.filter((resource) => resource.templateKind === 'knowledge-assessment-protocol');
  const visibleProtocolBatches = (data.protocolBatches ?? [])
    .filter((batch) => batch.orgId === currentOrg?.id)
    .map((batch) => ({
      batch,
      resource: data.resources.find((resource) => resource.id === batch.resourceId),
      employees: (batch.employeeIds ?? []).map((employeeId) => reportEmployees.find((employee) => employee.id === employeeId)).filter(Boolean),
    }))
    .filter(({ batch, resource, employees }) => {
      if (!resource || (reportTypeFilter !== 'visos' && reportTypeFilter !== 'Protokolas')) return false;
      const ready = isProtocolBatchReady(batch, employees, resource);
      const status = ready ? 'ready' : batch.cadence === 'until-full' && employees.length < protocolBatchCapacity ? 'collecting' : 'waiting';
      const query = `${resource.title} ${batch.periodStart} ${batch.periodEnd} ${employees.map((employee) => employee.name).join(' ')}`.toLocaleLowerCase('lt');
      return (protocolProgramFilter === 'visos' || resource.id === protocolProgramFilter)
        && (protocolStatusFilter === 'visos' || status === protocolStatusFilter)
        && query.includes(protocolSearch.trim().toLocaleLowerCase('lt'));
    })
    .sort((left, right) => (right.batch.periodStart ?? '').localeCompare(left.batch.periodStart ?? '') || right.batch.number - left.batch.number);
  const protocolPageSize = 10;
  const protocolPageCount = Math.max(1, Math.ceil(visibleProtocolBatches.length / protocolPageSize));
  const currentProtocolPage = Math.min(protocolPage, protocolPageCount);
  const paginatedProtocolBatches = visibleProtocolBatches.slice((currentProtocolPage - 1) * protocolPageSize, currentProtocolPage * protocolPageSize);
  const protocolRegistryPanel = (reportTypeFilter === 'visos' || reportTypeFilter === 'Protokolas') ? <Panel title="Periodinių protokolų registras">
    <div className="mb-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1.5fr)_minmax(14rem,1fr)_minmax(12rem,0.8fr)_auto]">
      <label className="block text-sm font-medium">Ieškoti darbuotojo<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} value={protocolSearch} onChange={(event) => { setProtocolSearch(event.target.value); setProtocolPage(1); }} placeholder="Vardas, pavardė" /></div></label>
      <label className="text-sm font-medium">Mokymo programa<select className={`${inputClass} mt-1`} value={protocolProgramFilter} onChange={(event) => { setProtocolProgramFilter(event.target.value); setProtocolPage(1); }}><option value="visos">Visos programos</option>{protocolResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}</select></label>
      <label className="text-sm font-medium">Būsena<select className={`${inputClass} mt-1`} value={protocolStatusFilter} onChange={(event) => { setProtocolStatusFilter(event.target.value); setProtocolPage(1); }}><option value="visos">Visos būsenos</option><option value="collecting">Kaupiamas</option><option value="waiting">Laukia testo</option><option value="ready">Paruoštas</option></select></label>
      <p className="pb-2 text-sm text-slate-500">Protokolų: <span className="font-semibold text-slate-800">{visibleProtocolBatches.length}</span></p>
    </div>
    {paginatedProtocolBatches.length ? <><DataTable headers={['Nr.', 'Mokymo programa', 'Laikotarpis', 'Darbuotojai', 'Data protokole', 'Būsena', 'Veiksmai']} rows={paginatedProtocolBatches.map(({ batch, resource, employees }) => {
      const ready = isProtocolBatchReady(batch, employees, resource);
      const status = ready ? 'Paruoštas' : batch.cadence === 'until-full' && employees.length < protocolBatchCapacity ? 'Kaupiamas' : 'Laukia testo';
                  const searchTerm = protocolSearch.trim().toLocaleLowerCase('lt');
                  const matchingEmployees = searchTerm ? employees.filter((employee) => employee.name.toLocaleLowerCase('lt').includes(searchTerm)) : [];
                  const listedEmployees = matchingEmployees.length ? matchingEmployees : employees.slice(0, 2);
                  const signedCount = employees.filter((employee) => data.signatures.some((signature) => signature.employeeId === employee.id && signature.resourceId === resource.id && signature.role === 'Darbuotojas')).length;
                  return [batch.number, resource.title, batch.cadence === 'until-full' ? 'Iki 15 darbuotojų' : `${formatProtocolDate(batch.periodStart)} – ${formatProtocolDate(batch.periodEnd)}`, <span className="block max-w-64 whitespace-normal" title={employees.map((employee) => employee.name).join(', ')}>{listedEmployees.map((employee) => employee.name).join(', ')}{employees.length > listedEmployees.length ? ` +${employees.length - listedEmployees.length}` : ''}<small className="mt-1 block text-xs text-slate-500">{signedCount} / {employees.length} pasirašė PIN kodu</small></span>, batch.protocolDate ? formatProtocolDate(batch.protocolDate) : 'Pildomas', status, <div className="flex flex-wrap gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50" onClick={() => openResourcePreview(resource, { protocolBatchId: batch.id })}><Eye size={15} className="mr-1 inline" />Atidaryti</button><button type="button" className={buttonClass} disabled={!ready} onClick={() => openResourcePreview(resource, { autoPrint: true, protocolBatchId: batch.id })}><Download size={15} />PDF</button></div>];
    })} /><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><p className="text-sm text-slate-500">Rodoma {(currentProtocolPage - 1) * protocolPageSize + 1}–{Math.min(currentProtocolPage * protocolPageSize, visibleProtocolBatches.length)} iš {visibleProtocolBatches.length}</p><nav className="flex items-center gap-2" aria-label="Protokolų puslapiavimas"><button type="button" aria-label="Ankstesnis protokolų puslapis" className="grid size-10 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={currentProtocolPage <= 1} onClick={() => setProtocolPage((page) => Math.max(1, page - 1))}><ChevronLeft size={17} /></button><span className="text-sm tabular-nums">{currentProtocolPage} / {protocolPageCount}</span><button type="button" aria-label="Kitas protokolų puslapis" className="grid size-10 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={currentProtocolPage >= protocolPageCount} onClick={() => setProtocolPage((page) => Math.min(protocolPageCount, page + 1))}><ChevronRight size={17} /></button></nav></div></> : <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">{(data.protocolBatches ?? []).some((batch) => batch.orgId === currentOrg?.id) ? 'Pagal pasirinktus filtrus protokolų nerasta.' : 'Kai darbuotojas pakviečiamas į protokolo mokymo programą, jo periodas atsiranda šiame registre.'}</p>}
  </Panel> : null;
  const reportTestResults = useMemo(() => {
    if (activeTab !== 'ataskaitos') return [];
    return reportEmployees.flatMap((employee) => (employee.testResults ?? []).map((result) => ({ employee, result, resource: data.resources.find((resource) => resource.id === result.resourceId) })))
    .filter(({ employee, resource }) => resource?.type === 'Testas' && currentOrg?.resources.includes(resource.id) && employee.resourceIds?.includes(resource.id))
    .sort((left, right) => new Date(right.result.completedAt) - new Date(left.result.completedAt));
  }, [activeTab, reportEmployees, data.resources, currentOrg?.resources]);
  const reportTestResources = selectedOrgResources.filter((resource) => resource.type === 'Testas' && (reportTypeFilter === 'visos' || reportTypeFilter === 'Testas'));
  const reportTestTarget = reportTestResources.find((resource) => resource.id === reportTestTargetId);
  const selectedTestResults = reportTestResults.filter(({ resource }) => resource.id === reportTestTarget?.id);
  const employeeDetails = data.employees.find((employee) => employee.id === employeeDetailsId);
  const aapIssueEmployee = data.employees.find((employee) => employee.id === aapIssueEmployeeId);
  const aapIssueOrganization = data.organizations.find((org) => org.id === aapIssueEmployee?.orgId);
  const employeeBeingEdited = data.employees.find((employee) => employee.id === editingEmployeeId);
  const accessibleOrganizations = userRole === 'dss' ? data.organizations.filter((org) => org.dss.includes(selectedSpecialistId) || org.dssInvitations?.some((invite) => invite.specialistId === selectedSpecialistId)) : data.organizations;
  const activeNavigation = roleNavigation[userRole] ?? roleNavigation.darbuotojas;
  const signatureIsCurrent = (signature) => !signature.validUntil || new Date(signature.validUntil).getTime() >= validityCheckTime;
  const hasCurrentWorkerSignature = (employeeId, resourceId) => data.signatures.some((signature) => signature.employeeId === employeeId && signature.resourceId === resourceId && signature.role === 'Darbuotojas' && signatureIsCurrent(signature));
  const hasEmployeeSignatures = (employeeId) => data.signatures.some((signature) => signature.employeeId === employeeId);
  const normalizedFormEmail = employeeForm.email.trim().toLocaleLowerCase('lt');
  const duplicateFormEmail = normalizedFormEmail && data.employees.find((employee) => employee.orgId === currentOrg?.id && employee.email?.toLocaleLowerCase('lt') === normalizedFormEmail);
  const employeeEmailError = employeeForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employeeForm.email.trim())
    ? 'Įveskite teisingą el. pašto adresą.'
    : duplicateFormEmail ? `El. paštas ${employeeForm.email.trim()} jau naudojamas kito darbuotojo.` : '';
  const normalizedFormContractNumber = employeeForm.contractNumber.trim().toLocaleLowerCase('lt');
  const duplicateFormContractEmployee = normalizedFormContractNumber && data.employees.find((employee) => employee.orgId === currentOrg?.id && employee.contractNumber?.toLocaleLowerCase('lt') === normalizedFormContractNumber);
  const employeeContractNumberError = duplicateFormContractEmployee
    ? hasEmployeeSignatures(duplicateFormContractEmployee.id)
      ? `Sutarties Nr. ${employeeForm.contractNumber.trim()} jau priskirtas darbuotojui ${duplicateFormContractEmployee.name}, kuris yra pasirašęs dokumentų. Pakeiskite numerį arba archyvuokite darbuotoją.`
      : `Sutarties Nr. ${employeeForm.contractNumber.trim()} jau priskirtas darbuotojui ${duplicateFormContractEmployee.name}. Pakeiskite numerį arba pirmiausia ištrinkite šį nepasirašiusį darbuotoją.`
    : '';
  const getTaskStatus = (employee, resource) => getResourceWorkflowStatus(employee, resource, data.signatures, data.organizations, validityCheckTime, data.specialists);
  const dashboardResourceGroups = data.resourceTypes.map((type) => ({
    key: `resource-type:${type}`,
    label: resourceTypeDisplayNames[type] ?? type,
    match: (resource) => resource.type === type,
  }));
  const getDashboardGroupSummary = (employee, resources, group) => {
    const assigned = resources.filter(group.match);
    if (!assigned.length) return null;
    const isTest = assigned[0].type === 'Testas';
    const entries = assigned.map((resource) => ({ resource, status: getTaskStatus(employee, resource) }));
    const completed = entries.every(({ resource, status }) => isTest
      ? employee.progressByResource?.[resource.id] === 'completed' || ['signed', 'unsigned'].includes(status.key)
      : status.key === 'signed');
    const label = isTest ? completed ? 'Išlaikyta' : 'Neišlaikyta' : completed ? pinSignedStatusLabel : 'Nepasirašyta';
    const Icon = completed ? CircleCheck : isTest ? CircleX : CircleAlert;
    const tone = completed ? 'bg-emerald-100 text-emerald-800' : isTest ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800';
    const title = entries.map(({ resource, status }) => {
      const itemLabel = isTest ? employee.progressByResource?.[resource.id] === 'completed' || ['signed', 'unsigned'].includes(status.key) ? 'Išlaikyta' : 'Neišlaikyta' : status.key === 'signed' ? pinSignedStatusLabel : 'Nepasirašyta';
      return `${resource.title}: ${itemLabel}`;
    }).join('\n');
    return { label, Icon, tone, title };
  };
  const getEmployeeStatusFilter = (employee) => {
    const statuses = (employee.resourceIds ?? []).map((resourceId) => data.resources.find((resource) => resource.id === resourceId)).filter(Boolean).map((resource) => getTaskStatus(employee, resource).key);
    if (statuses.some((status) => ['todo', 'unsigned', 'expired'].includes(status))) return 'truksta';
    if (statuses.some((status) => ['started', 'awaitingDss', 'awaitingEmployer', 'awaitingCommission', 'awaitingSignatures'].includes(status))) return 'vyksta';
    return statuses.length ? 'atlikta' : employee.status === 'Pakviestas' ? 'truksta' : 'nepriskirta';
  };
  const getEmployeeDashboardBadge = (employee, resources) => {
    const statuses = resources.map((resource) => getTaskStatus(employee, resource).key);
    if (statuses.length && statuses.every((status) => status === 'signed')) return { label: pinSignedStatusLabel, cls: 'bg-emerald-100 text-emerald-800', Icon: CircleCheck };
    const awaitingDss = statuses.includes('awaitingDss');
    const awaitingEmployer = statuses.includes('awaitingEmployer');
    const awaitingCommission = statuses.includes('awaitingCommission');
    if (awaitingDss || awaitingEmployer || awaitingCommission) {
      const waitingFor = [
        ...(awaitingEmployer ? ['vadovo'] : []),
        ...(awaitingDss ? ['DSS specialisto'] : []),
        ...(awaitingCommission ? ['komisijos'] : []),
      ];
      const label = waitingFor.length > 1
        ? `Laukia ${waitingFor.slice(0, -1).join(', ')} ir ${waitingFor.at(-1)} parašų`
        : `Laukia ${waitingFor[0]} parašo`;
      return { label, cls: 'bg-amber-100 text-amber-800', Icon: CircleAlert };
    }
    if (statuses.includes('unsigned')) return { label: 'Nepasirašyta', cls: 'bg-amber-100 text-amber-800', Icon: CircleAlert };
    if (statuses.some((status) => ['todo', 'expired'].includes(status))) return { label: 'Neatlikta', cls: 'bg-orange-100 text-orange-800', Icon: CircleX };
    if (statuses.includes('awaitingSignatures')) return { label: 'Laukia parašų', cls: 'bg-amber-100 text-amber-800', Icon: CircleAlert };
    if (statuses.includes('started')) return { label: 'Vyksta', cls: 'bg-amber-100 text-amber-800', Icon: CircleAlert };
    if (employee.status === 'Pakviestas') return { label: 'Pakviestas', cls: 'bg-amber-100 text-amber-800', Icon: CircleAlert };
    return { label: 'Nepriskirta', cls: 'bg-slate-100 text-slate-600', Icon: CircleAlert };
  };
  const filteredOrgEmployees = useMemo(() => orgEmployees.filter((employee) => `${employee.name} ${employee.email} ${employee.contractNumber} ${employee.position}`.toLocaleLowerCase('lt').includes(employeeSearch.trim().toLocaleLowerCase('lt'))), [orgEmployees, employeeSearch]);
  const employeePageCount = Math.max(1, Math.ceil(filteredOrgEmployees.length / employeePageSize));
  const currentEmployeePage = Math.min(employeePage, employeePageCount);
  const creatorMembershipsByOrg = useMemo(() => {
    const membershipsByOrg = new Map();
    for (const account of creatorAccounts) {
      for (const membership of account.organizations ?? []) {
        const memberships = membershipsByOrg.get(membership.id) ?? [];
        memberships.push({ ...account, membership });
        membershipsByOrg.set(membership.id, memberships);
      }
    }
    return membershipsByOrg;
  }, [creatorAccounts]);
  const creatorOrganizations = useMemo(() => data.organizations
    .filter((organization) => `${organization.name} ${organization.companyCode ?? ''}`.toLocaleLowerCase('lt').includes(creatorOrganizationSearch.trim().toLocaleLowerCase('lt')))
    .map((organization) => {
      const memberships = creatorMembershipsByOrg.get(organization.id) ?? [];
      return {
        organization,
        managers: memberships.filter((account) => account.membership.role === 'manager'),
        specialists: memberships.filter((account) => account.membership.role === 'dss_specialist'),
      };
    }), [data.organizations, creatorOrganizationSearch, creatorMembershipsByOrg]);
  const creatorAccountsFiltered = useMemo(() => creatorAccounts
    .filter((account) => `${account.fullName ?? ''} ${account.email ?? ''} ${account.accountType ?? ''} ${(account.organizations ?? []).map((organization) => organization.name).join(' ')}`.toLocaleLowerCase('lt').includes(creatorAccountSearch.trim().toLocaleLowerCase('lt'))), [creatorAccounts, creatorAccountSearch]);
  const creatorOrganizationPageSize = 20;
  const creatorOrganizationPageCount = Math.max(1, Math.ceil(creatorOrganizations.length / creatorOrganizationPageSize));
  const paginatedCreatorOrganizations = creatorOrganizations.slice((creatorOrganizationPage - 1) * creatorOrganizationPageSize, creatorOrganizationPage * creatorOrganizationPageSize);
  const creatorAccountPageSize = 20;
  const creatorAccountPageCount = Math.max(1, Math.ceil(creatorAccountsFiltered.length / creatorAccountPageSize));
  const paginatedCreatorAccounts = creatorAccountsFiltered.slice((creatorAccountPage - 1) * creatorAccountPageSize, creatorAccountPage * creatorAccountPageSize);
  const getDashboardSortValue = (employee, key) => {
    if (key === 'medical') return employee.medicalCertificateValidUntil ? new Date(employee.medicalCertificateValidUntil).getTime() : null;
    if (key === 'status') return ({ atlikta: 0, vyksta: 1, truksta: 2, nepriskirta: 3 })[getEmployeeStatusFilter(employee)];
    const group = dashboardResourceGroups.find((item) => item.key === key);
    if (!group) return 6;
    const statusRanks = (employee.resourceIds ?? []).filter((id) => currentOrg.resources.includes(id)).map((id) => data.resources.find((resource) => resource.id === id)).filter((resource) => resource && group?.match(resource)).map((resource) => resourceStatusOrder[getTaskStatus(employee, resource).key] ?? 6);
    return statusRanks.length ? Math.max(...statusRanks) : 6;
  };
  const sortedOrgEmployees = [...filteredOrgEmployees].sort((left, right) => {
    const leftValue = getDashboardSortValue(left, employeeSort.key);
    const rightValue = getDashboardSortValue(right, employeeSort.key);
    if (leftValue === null || rightValue === null) return leftValue === rightValue ? left.name.localeCompare(right.name, 'lt') : leftValue === null ? 1 : -1;
    const comparison = typeof leftValue === 'string' ? leftValue.localeCompare(rightValue, 'lt') : leftValue - rightValue;
    return (comparison * (employeeSort.direction === 'asc' ? 1 : -1)) || left.name.localeCompare(right.name, 'lt');
  });
  const paginatedOrgEmployees = sortedOrgEmployees.slice((currentEmployeePage - 1) * employeePageSize, currentEmployeePage * employeePageSize);
  const employeeSignatures = data.signatures.filter((signature) => signature.employeeId === currentEmployee?.id && signature.role === 'Darbuotojas');
  const pendingResourceIds = (currentEmployee?.resourceIds ?? []).filter((resourceId) => {
    const resource = data.resources.find((item) => item.id === resourceId);
    return resource && ['todo', 'started', 'unsigned', 'expired'].includes(getTaskStatus(currentEmployee, resource).key);
  });
  const startedCount = (currentEmployee?.resourceIds ?? []).filter((resourceId) => getTaskStatus(currentEmployee, data.resources.find((item) => item.id === resourceId)).key === 'started').length;
  const unsignedCount = (currentEmployee?.resourceIds ?? []).filter((resourceId) => getTaskStatus(currentEmployee, data.resources.find((item) => item.id === resourceId)).key === 'unsigned').length;
  const workerSignedCount = (currentEmployee?.resourceIds ?? []).filter((resourceId) => ['signed', 'awaitingDss', 'awaitingEmployer', 'awaitingCommission', 'awaitingSignatures'].includes(getTaskStatus(currentEmployee, data.resources.find((item) => item.id === resourceId)).key)).length;
  const employeeResources = (currentEmployee?.resourceIds ?? []).map((id) => data.resources.find((resource) => resource.id === id)).filter(Boolean);
  const visibleEmployeeResources = employeeResources.filter((resource) => {
    const status = getTaskStatus(currentEmployee, resource).key;
    const matchesFilter = taskFilter === 'visos' || (taskFilter === 'atliktinos' && !['signed', 'awaitingDss', 'awaitingEmployer', 'awaitingCommission', 'awaitingSignatures'].includes(status)) || (taskFilter === 'baigtos' && ['signed', 'awaitingDss', 'awaitingEmployer', 'awaitingCommission', 'awaitingSignatures'].includes(status));
    return matchesFilter && `${resource.title} ${resource.category} ${resource.type}`.toLocaleLowerCase('lt').includes(taskSearch.trim().toLocaleLowerCase('lt'));
  });
  const visibleLibraryResources = data.resources.filter((resource) => !resource.organizationId || (userRole === 'vadovas' && resource.organizationId === currentOrg?.id));
  const filteredLibraryResources = visibleLibraryResources.filter((resource) => {
    const matchesType = libraryTypeFilter === 'visos' || resource.type === libraryTypeFilter;
    const matchesSearch = `${resource.title} ${resource.category} ${resource.type}`.toLocaleLowerCase('lt').includes(librarySearch.trim().toLocaleLowerCase('lt'));
    return matchesType && matchesSearch;
  });
  const dssTasks = useMemo(() => {
    const latestDssSignatureByTask = new Map();
    for (const signature of data.signatures) {
      if (signature.orgId !== currentOrg?.id || signature.role !== 'DSS specialistas' || (signature.validUntil && new Date(signature.validUntil).getTime() < validityCheckTime)) continue;
      const key = JSON.stringify([signature.employeeId, signature.resourceId]);
      const signedAt = new Date(signature.signedAt).getTime();
      latestDssSignatureByTask.set(key, Math.max(latestDssSignatureByTask.get(key) ?? -Infinity, signedAt));
    }
    return data.signatures.filter((signature) => {
      if (signature.orgId !== currentOrg?.id || signature.role !== 'Darbuotojas' || (signature.validUntil && new Date(signature.validUntil).getTime() < validityCheckTime)) return false;
      const resource = data.resources.find((item) => item.id === signature.resourceId);
      const employee = data.employees.find((item) => item.id === signature.employeeId);
      const assignedSpecialist = currentOrg?.dss.includes(selectedSpecialistId);
      const requiresDss = resource ? getRequiredSigners(resource, currentOrg, employee).includes('DSS specialistas') : false;
      const latestDssSignedAt = latestDssSignatureByTask.get(JSON.stringify([signature.employeeId, signature.resourceId]));
      return assignedSpecialist && requiresDss && !(latestDssSignedAt >= new Date(signature.signedAt).getTime());
    });
  }, [data.signatures, data.resources, data.employees, currentOrg, selectedSpecialistId, validityCheckTime]);
  const currentDssTasks = dssTasks.filter((task) => task.orgId === currentOrg?.id);
  const filteredSpecialists = useMemo(() => {
    const query = specialistQuery.trim().toLocaleLowerCase('lt');
    if (!query) return [];
    return data.specialists.filter((specialist) => `${specialist.name} ${specialist.email}`.toLocaleLowerCase('lt').includes(query)).sort((left, right) => {
      const score = (specialist) => specialist.email.toLocaleLowerCase('lt') === query ? 0 : specialist.name.toLocaleLowerCase('lt') === query ? 1 : 2;
      return score(left) - score(right);
    });
  }, [data.specialists, specialistQuery]);

  const updateOrg = (orgId, updater) => setData((current) => ({
    ...current,
    organizations: current.organizations.map((org) => org.id === orgId ? updater(org) : org),
  }));

  const inviteEmployeeToCommission = async (employeeId, role) => {
    const employee = data.employees.find((item) => item.id === employeeId && item.orgId === currentOrg?.id);
    if (!employee) {
      setNotice('Pasirinktas darbuotojas nerastas šioje įmonėje.');
      return false;
    }
    if ((data.commissionAssignments ?? []).some((item) => item.organizationId === currentOrg.id && item.employeeId === employee.id && ['pending', 'accepted'].includes(item.status))) {
      setNotice(`${employee.name} jau turi aktyvų komisijos paskyrimą.`);
      return false;
    }
    if (role === 'Komisijos pirmininkas' && (data.commissionAssignments ?? []).some((item) => item.organizationId === currentOrg.id && item.role === role && ['pending', 'accepted'].includes(item.status))) {
      setNotice('Komisijos pirmininkas jau paskirtas arba dar neatsakė į kvietimą.');
      return false;
    }
    if (cloudMode) {
      const { data: assignment, error } = await supabase.rpc('invite_employee_to_commission', {
        input_organization_id: currentOrg.id,
        input_employee_id: employee.id,
        input_role: role,
      });
      if (error) {
        setNotice(`Komisijos kvietimo išsiųsti nepavyko: ${error.message}`);
        return false;
      }
      setData((current) => ({
        ...current,
        commissionAssignments: [...(current.commissionAssignments ?? []).filter((item) => item.id !== assignment.id), assignment],
      }));
    } else {
      const assignment = {
        id: `commission-${crypto.randomUUID()}`,
        organizationId: currentOrg.id,
        employeeId: employee.id,
        employeeName: employee.name,
        employeeEmail: employee.email,
        role,
        status: 'pending',
        invitedAt: new Date().toISOString(),
      };
      setData((current) => ({
        ...current,
        commissionAssignments: [...(current.commissionAssignments ?? []), assignment],
        commissionInvitations: [...(current.commissionInvitations ?? []), { ...assignment, organizationName: currentOrg.name }],
      }));
    }
    setNotice(`${employee.name} išsiųstas kvietimas tapti ${role === 'Komisijos pirmininkas' ? 'komisijos pirmininku' : 'DSS komisijos nariu'}.`);
    return true;
  };

  const revokeCommissionAssignment = async (assignment) => {
    if (cloudMode) {
      const { data: revoked, error } = await supabase.rpc('revoke_employee_commission_assignment', {
        input_organization_id: assignment.organizationId,
        input_assignment_id: assignment.id,
      });
      if (error || !revoked) {
        setNotice(`Komisijos paskyrimo atšaukti nepavyko: ${error?.message ?? 'paskyrimas nerastas.'}`);
        return;
      }
    }
    setData((current) => {
      const commissionAssignments = (current.commissionAssignments ?? []).map((item) => item.id === assignment.id ? { ...item, status: 'revoked' } : item);
      return {
        ...current,
        commissionAssignments,
        commissionInvitations: (current.commissionInvitations ?? []).map((item) => item.id === assignment.id ? { ...item, status: 'revoked' } : item),
      };
    });
    setNotice(`${assignment.employeeName} komisijos paskyrimas atšauktas.`);
  };

  const respondToCommissionInvitation = async (accept) => {
    const invitation = commissionInvitationTarget;
    if (!invitation || invitation.status !== 'pending') return;
    if (accept && (!commissionConsentChecked || !signatureInk)) {
      setCommissionActionError('Pažymėkite sutikimą ir pasirašykite prieš patvirtindami PIN.');
      return;
    }
    setCommissionActionSubmitting(true);
    setCommissionActionError('');
    let uploadedSignature = null;
    let taskRefreshError = '';
    try {
      if (cloudMode && accept) uploadedSignature = await uploadSignatureDataUrl(invitation.organizationId, signatureInk);
      if (cloudMode) {
        const { data: response, error } = await supabase.rpc('respond_to_commission_invitation', {
          input_assignment_id: invitation.id,
          input_accept: accept,
          input_pin: accept ? workerSignPin : '',
          input_signature_path: uploadedSignature?.path ?? null,
        });
        if (error || !response) throw new Error(error?.message || 'PIN kodas neteisingas arba per daug kartų bandyta.');
        setData((current) => ({
          ...current,
          commissionInvitations: (current.commissionInvitations ?? []).map((item) => item.id === invitation.id
            ? { ...item, ...response, signaturePath: uploadedSignature?.path }
            : item),
        }));
        if (accept) {
          try {
            const { data: tasks, error: taskError } = await supabase.rpc('get_employee_protocol_commission_tasks');
            if (taskError) throw taskError;
            const commissionTasks = tasks ?? [];
            const commissionAssignments = [...new Map(commissionTasks.flatMap((task) => task.commissionAssignments ?? []).map((assignment) => [assignment.id, assignment])).values()];
            const protocolCommissionSignatures = [...new Map(commissionTasks.flatMap((task) => task.protocolCommissionSignatures ?? []).map((signature) => [signature.id, signature])).values()];
            setData((current) => ({ ...current, commissionTasks, commissionAssignments, protocolCommissionSignatures }));
          } catch (error) {
            taskRefreshError = error.message || 'Protokolų užduočių atnaujinti nepavyko.';
          }
        }
      } else {
        if (accept && workerSignPin !== currentEmployee?.pin) throw new Error('PIN kodas neteisingas.');
        const response = {
          status: accept ? 'accepted' : 'declined',
          respondedAt: new Date().toISOString(),
          consentSignatureMethod: accept ? 'PIN' : null,
          consentIp: accept ? '127.0.0.1 (demo)' : null,
          signatureImage: accept ? signatureInk : null,
        };
        setData((current) => ({
          ...current,
          commissionInvitations: (current.commissionInvitations ?? []).map((item) => item.id === invitation.id ? { ...item, ...response } : item),
          commissionAssignments: (current.commissionAssignments ?? []).map((item) => item.id === invitation.id ? { ...item, ...response } : item),
        }));
      }
      setCommissionInvitationTarget(null);
      setWorkerSignPin('');
      setSignatureInk('');
      setCommissionConsentChecked(false);
      setNotice(taskRefreshError
        ? `Sutikimas išsaugotas, bet protokolų užduočių atnaujinti nepavyko: ${taskRefreshError}`
        : accept ? 'Sutikimas tapti komisijos nariu pasirašytas.' : 'Kvietimo atsisakyta.');
    } catch (error) {
      if (uploadedSignature?.path) await removeSignatureAsset(uploadedSignature.path);
      setCommissionActionError(error.message || 'Komisijos kvietimo atsakymo išsaugoti nepavyko.');
    } finally {
      setCommissionActionSubmitting(false);
    }
  };

  const signProtocolCommissionTask = async (event) => {
    event.preventDefault();
    const task = protocolCommissionTaskTarget;
    if (!task || !signatureInk) {
      setCommissionActionError('Nupieškite parašą prieš pasirašydami protokolą.');
      return;
    }
    setCommissionActionSubmitting(true);
    setCommissionActionError('');
    let uploadedSignature = null;
    try {
      if (cloudMode) {
        uploadedSignature = await uploadSignatureDataUrl(task.organizationId, signatureInk);
        const { data: signature, error } = await supabase.rpc('record_employee_protocol_commission_signature', {
          input_assignment_id: task.assignmentId,
          input_batch_id: task.batchId,
          input_pin: workerSignPin,
          input_signature_path: uploadedSignature.path,
        });
        if (error || !signature) throw new Error(error?.message || 'PIN kodas neteisingas arba per daug kartų bandyta.');
        setData((current) => ({
          ...current,
          protocolCommissionSignatures: [...(current.protocolCommissionSignatures ?? []), { ...signature, signaturePath: uploadedSignature.path }],
          commissionTasks: (current.commissionTasks ?? []).map((item) => item.assignmentId === task.assignmentId && item.batchId === task.batchId
            ? { ...item, hasSigned: true, protocolCommissionSignatures: [...(item.protocolCommissionSignatures ?? []), { ...signature, signaturePath: uploadedSignature.path }] }
            : item),
        }));
      } else {
        if (workerSignPin !== currentEmployee?.pin) throw new Error('PIN kodas neteisingas.');
        const signature = {
          id: `protocol-commission-${crypto.randomUUID()}`,
          orgId: task.organizationId,
          batchId: task.batchId,
          assignmentId: task.assignmentId,
          employeeId: currentEmployee.id,
          signer: currentEmployee.name,
          role: task.role,
          signatureMethod: 'PIN',
          signedAt: new Date().toISOString(),
          ip: '127.0.0.1 (demo)',
          signatureImage: signatureInk,
        };
        setData((current) => ({
          ...current,
          protocolCommissionSignatures: [...(current.protocolCommissionSignatures ?? []), signature],
          commissionTasks: (current.commissionTasks ?? []).filter((item) => item.assignmentId !== task.assignmentId || item.batchId !== task.batchId),
        }));
      }
      setProtocolCommissionTaskTarget(null);
      setWorkerSignPin('');
      setSignatureInk('');
      setNotice('Protokolas pasirašytas PIN kodu.');
    } catch (error) {
      if (uploadedSignature?.path) await removeSignatureAsset(uploadedSignature.path);
      setCommissionActionError(error.message || 'Protokolo parašo įrašyti nepavyko.');
    } finally {
      setCommissionActionSubmitting(false);
    }
  };

  const openAapIssueForm = (employee) => {
    if (!employee.resourceIds?.includes('res-aap')) {
      setNotice('Pirmiausia darbuotojui priskirkite AAP kortelę.');
      return;
    }
    setAapIssueEmployeeId(employee.id);
    setAapIssueSelectedItemIds([]);
    setAapIssueDate(new Date().toISOString().slice(0, 10));
    setAapIssueIssuer(cloudMode ? cloudManagerName : data.organizations.find((org) => org.id === employee.orgId)?.manager ?? '');
    setAapIssueQuantities({});
    document.getElementById('aap-issuance-dialog')?.showModal();
  };

  const downloadAapIssuance = (issuance) => {
    const employee = data.employees.find((item) => item.id === issuance.employeeId);
    const org = data.organizations.find((item) => item.id === issuance.orgId);
    if (!employee || !org || issuance.status !== 'signed') {
      setNotice('Pasirašyto AAP išdavimo dokumento paruošti nepavyko.');
      return;
    }
    printPdfHtml(buildAapIssuanceHtml(issuance, employee, org), `AAP_isdavimas_${employee.name}_${issuance.issuedAt}`)
      .catch((error) => setNotice(`AAP išdavimo PDF paruošti nepavyko: ${error.message}`));
  };

  const createAapIssuance = (event) => {
    event.preventDefault();
    const employee = data.employees.find((item) => item.id === aapIssueEmployeeId);
    const org = data.organizations.find((item) => item.id === employee?.orgId);
    const items = org?.aapItems ?? [];
    const selectedItems = items.filter((item) => aapIssueSelectedItemIds.includes(item.id));
    if (!employee || !org || !employee.resourceIds?.includes('res-aap') || !selectedItems.length || !aapIssueDate || !aapIssueIssuer.trim()) {
      setNotice('Nurodykite išdavėją, pasirinkite bent vieną AAP priemonę ir datą.');
      return;
    }
    const issuance = {
      id: `aap-issue-${crypto.randomUUID()}`,
      orgId: org.id,
      employeeId: employee.id,
      employeeName: employee.name,
      issuedAt: aapIssueDate,
      issuedBy: aapIssueIssuer.trim(),
      issuedByUserId: cloudMode ? cloudUserId : null,
      items: selectedItems.map((item) => ({
        id: item.id,
        code: item.code ?? '',
        name: item.name,
        reason: item.reason ?? '',
        quantity: Number(aapIssueQuantities[item.id] ?? item.quantity) || 1,
        unit: item.unit ?? '',
        validity: item.validity ?? '',
        unitPrice: Number(item.unitPrice) || 0,
      })),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, aapIssuances: [...(current.aapIssuances ?? []), issuance] }));
    setAapIssueEmployeeId(null);
    setAapIssueSelectedItemIds([]);
    setAapIssueQuantities({});
    document.getElementById('aap-issuance-dialog')?.close();
    setNotice(`Užregistruotas ${selectedItems.length} AAP priemonių išdavimas. Darbuotojas turi patvirtinti gavimą.`);
  };

  const confirmAapIssueSign = async (event) => {
    event.preventDefault();
    const issuance = (data.aapIssuances ?? []).find((item) => item.id === aapIssueSigningTarget);
    if (!issuance || issuance.employeeId !== currentEmployee?.id) {
      setAapIssueSignError('AAP išdavimo įrašo rasti nepavyko.');
      return;
    }
    if (issuance.status === 'signed') {
      setAapIssueSignError('Šis AAP išdavimas jau patvirtintas.');
      return;
    }
    if (!signatureInk) {
      setAapIssueSignError('Nupieškite parašą prieš patvirtindami PIN.');
      return;
    }
    setAapIssueSignSubmitting(true);
    try {
      if (cloudMode) {
        const uploadedSignature = await uploadSignatureDataUrl(issuance.orgId, signatureInk);
        try {
          const { data: signedIssuance, error } = await supabase.rpc('record_employee_aap_issuance_signature', {
            input_issuance_id: issuance.id,
            input_pin: workerSignPin,
            input_signature_path: uploadedSignature.path,
          });
          if (error || !signedIssuance) throw new Error(error?.message || 'PIN kodas neteisingas arba per daug kartų bandyta.');
          setData((current) => ({
            ...current,
            aapIssuances: (current.aapIssuances ?? []).map((item) => item.id === signedIssuance.id
              ? { ...signedIssuance, signaturePath: uploadedSignature.path }
              : item),
          }));
        } catch (error) {
          await removeSignatureAsset(uploadedSignature.path);
          throw error;
        }
      } else {
        if (workerSignPin !== currentEmployee.pin) throw new Error('PIN kodas neteisingas.');
        const signedAt = new Date().toISOString();
        setData((current) => ({
          ...current,
          aapIssuances: (current.aapIssuances ?? []).map((item) => item.id === issuance.id ? {
            ...item,
            status: 'signed',
            signer: currentEmployee.name,
            signedAt,
            signatureMethod: 'PIN',
            signatureImage: signatureInk,
            ip: '127.0.0.1 (demo)',
          } : item),
        }));
      }
      setAapIssueSigningTarget(null);
      setWorkerSignPin('');
      setSignatureInk('');
      setAapIssueSignError('');
      setNotice('AAP priemonių gavimas patvirtintas.');
    } catch (error) {
      setAapIssueSignError(error.message || 'AAP gavimo patvirtinti nepavyko.');
    } finally {
      setAapIssueSignSubmitting(false);
    }
  };

  const openResourceSettings = (resource) => {
    const defaults = resource.defaultSettings ?? {};
    const saved = currentOrg?.resourceSettings?.[resource.id] ?? {};
    setResourceSettingsTarget(resource);
    setResourceSettingsDraft({
      ...defaults,
      ...saved,
      validityMonths: saved.validityMonths ?? defaults.validityMonths ?? resource.validityMonths ?? 12,
      requiredSigners: saved.requiredSigners ?? defaults.requiredSigners ?? resource.requiredSigners ?? ['Darbuotojas'],
      ...(resource.templateKind === 'knowledge-assessment-protocol' ? { protocolCadence: saved.protocolCadence ?? defaults.protocolCadence ?? 'weekly-friday' } : {}),
    });
  };

  const saveResourceSettings = (event) => {
    event.preventDefault();
    if (!currentOrg || !resourceSettingsTarget) return;
    const settings = { ...resourceSettingsDraft, requiredSigners: [...new Set(['Darbuotojas', ...(resourceSettingsDraft.requiredSigners ?? [])])] };
    if (settings.rowCount !== undefined) settings.rowCount = Math.max(1, Number(settings.rowCount) || 1);
    if (settings.validityMonths !== undefined) settings.validityMonths = Math.max(1, Number(settings.validityMonths) || 12);
    setData((current) => {
      const updated = {
        ...current,
        organizations: current.organizations.map((org) => org.id === currentOrg.id
          ? { ...org, resourceSettings: { ...org.resourceSettings, [resourceSettingsTarget.id]: settings } }
          : org),
      };
      if (resourceSettingsTarget.templateKind !== 'knowledge-assessment-protocol') return updated;
      let protocolBatches = current.protocolBatches ?? [];
      const employees = current.employees.map((employee) => {
        if (employee.orgId !== currentOrg.id) return employee;
        const result = addEmployeeToProtocolBatches({ ...updated, protocolBatches }, employee);
        protocolBatches = result.batches;
        return { ...employee, resourceIds: result.resourceIds };
      });
      return { ...updated, employees, protocolBatches };
    });
    setResourceSettingsTarget(null);
    setNotice(`„${resourceSettingsTarget.title}“ nustatymai išsaugoti įmonei.`);
  };

  const recordWorkerSignature = (employee, resource, savedSignature = null) => {
    const existing = hasCurrentWorkerSignature(employee.id, resource.id);
    if (existing) return;
    const signature = savedSignature ?? {
      id: `sig-${Date.now()}`,
      orgId: employee.orgId,
      employeeId: employee.id,
      contractNumber: employee.contractNumber ?? '',
      resourceId: resource.id,
      aapSnapshot: resource.id === 'res-aap' ? createAapSnapshot(employee, data.organizations.find((org) => org.id === employee.orgId)) : undefined,
      signer: employee.name,
      role: 'Darbuotojas',
      signatureMethod: 'PIN',
      signedAt: new Date().toISOString(),
      validUntil: getValidityUntil(resource.validityMonths),
      signatureImage: signatureInk,
      ip: '127.0.0.1 (demo)',
    };
    setData((current) => ({
      ...current,
      employees: current.employees.map((item) => item.id === employee.id ? { ...item, progressByResource: { ...item.progressByResource, [resource.id]: 'completed' } } : item),
      signatures: [...current.signatures, signature],
    }));
    setNotice(`Dokumentas „${resource.title}“ pasirašytas PIN kodu.`);
  };

  const requestWorkerSign = (employee, resource) => {
    if (resource.templateKind === 'knowledge-assessment-protocol' && !hasPassedProtocolTest(employee, resource)) {
      const hasTestAttempt = employee.testResults?.some((result) => result.resourceId === resource.relatedTestId);
      setNotice(hasTestAttempt
        ? 'Protokolą galėsite pasirašyti tik išlaikę susijusios mokymo programos testą.'
        : 'Pirmiausia atlikite ir išlaikykite susijusios mokymo programos testą, tada pasirašykite protokolą.');
      return;
    }
    if (resource.id === 'res-aap' && !hasSavedAapSizes(employee)) {
      setActiveTab('aap');
      setNotice('Prieš pasirašydami AAP kortelę, užpildykite batų, drabužių, kelnių ir striukės dydžius.');
      return;
    }
    if (!cloudMode && (!employee.pin || employee.pin.length !== 4)) {
      setActiveTab('paskyra');
      setNotice('Pirmiausia paskyroje susikurkite 4 skaitmenų pasirašymo PIN.');
      return;
    }
    setWorkerSigningTarget({ employeeId: employee.id, resourceId: resource.id });
    setSignatureInk('');
    setWorkerSignPin('');
    setWorkerSignError('');
  };

  const confirmWorkerSign = async (event) => {
    event.preventDefault();
    const employee = data.employees.find((item) => item.id === workerSigningTarget.employeeId);
    const resource = data.resources.find((item) => item.id === workerSigningTarget.resourceId);
    if (resource?.templateKind === 'knowledge-assessment-protocol' && !hasPassedProtocolTest(employee, resource)) {
      setWorkerSigningTarget(null);
      const hasTestAttempt = employee?.testResults?.some((result) => result.resourceId === resource.relatedTestId);
      setNotice(hasTestAttempt
        ? 'Protokolą galėsite pasirašyti tik išlaikę susijusios mokymo programos testą.'
        : 'Pirmiausia atlikite ir išlaikykite susijusios mokymo programos testą, tada pasirašykite protokolą.');
      return;
    }
    if (resource?.id === 'res-aap' && !hasSavedAapSizes(employee)) {
      setWorkerSigningTarget(null);
      setActiveTab('aap');
      setNotice('Prieš pasirašydami AAP kortelę, užpildykite batų, drabužių, kelnių ir striukės dydžius.');
      return;
    }
    if (!employee || !resource) {
      setWorkerSignError('Nepavyko rasti pasirašomo dokumento.');
      return;
    }
    if (!signatureInk) {
      setWorkerSignError('Nupieškite parašą prieš patvirtindami PIN.');
      return;
    }
    if (cloudMode && userRole === 'darbuotojas') {
      const assignedResourceIds = new Set(employee.resourceIds ?? []);
      const inputProgress = Object.fromEntries(Object.entries(employee.progressByResource ?? {}).filter(([resourceId]) => assignedResourceIds.has(resourceId)));
      inputProgress[resource.id] = 'completed';
      const { error: progressError } = await supabase.rpc('save_employee_workspace', {
        input_sizes: employee.sizes ?? {},
        input_progress: inputProgress,
      });
      if (progressError) {
        setWorkerSignError('Dokumento būsenos išsaugoti nepavyko. Bandykite dar kartą.');
        return;
      }
      let uploadedSignature;
      try {
        uploadedSignature = await uploadSignatureDataUrl(employee.orgId, signatureInk);
      } catch (error) {
        setWorkerSignError(`Parašo įkelti nepavyko: ${error.message}`);
        return;
      }
      const { data: signature, error } = await supabase.rpc('record_employee_signature_with_image', {
        input_resource_id: resource.id,
        input_pin: workerSignPin,
        input_signature_image: uploadedSignature.path,
      });
      if (error) {
        await removeSignatureAsset(uploadedSignature.path);
        setWorkerSignError(error.message || 'PIN patikrinti nepavyko.');
        return;
      }
      if (!signature) {
        await removeSignatureAsset(uploadedSignature.path);
        setWorkerSignError('PIN kodas neteisingas arba per daug kartų bandyta.');
        return;
      }
      recordWorkerSignature(employee, resource, { ...signature, signaturePath: uploadedSignature.path });
    } else if (workerSignPin !== employee.pin) {
      setWorkerSignError('PIN kodas neteisingas.');
      return;
    } else {
      recordWorkerSignature(employee, resource);
    }
    setWorkerSigningTarget(null);
    setWorkerSignPin('');
    setSignatureInk('');
  };

  const completeReadThenSign = (employee, resource) => {
    setData((current) => ({ ...current, employees: current.employees.map((item) => item.id === employee.id ? { ...item, progressByResource: { ...item.progressByResource, [resource.id]: 'completed' } } : item) }));
    requestWorkerSign(employee, resource);
  };

  const handleResourceFile = async (file, field) => {
    if (!file) return;
    if (file.size > 10_000_000) {
      setNotice('Failas per didelis. Didžiausias leidžiamas dydis yra 10 MB.');
      return;
    }
    if (cloudMode && userRole === 'kurejas') {
      setResourceFileUploading(true);
      try {
        const { publicUrl } = await uploadCreatorAsset(file);
        if (field === 'html') {
          const html = await file.text();
          const parsed = new DOMParser().parseFromString(html, 'text/html');
          setResourceForm((current) => ({ ...current, html, htmlUrl: publicUrl, title: current.title || parsed.title || '' }));
        } else {
          setResourceForm((current) => ({ ...current, image: publicUrl, imageUrl: publicUrl }));
        }
      } catch (error) {
        setNotice(`Failo įkelti nepavyko: ${error.message}`);
      } finally {
        setResourceFileUploading(false);
      }
      return;
    }

    if (field === 'html') {
      const html = await file.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      setResourceForm((current) => ({ ...current, html, title: current.title || parsed.title || '' }));
    } else {
      const reader = new FileReader();
      reader.onload = () => setResourceForm((current) => ({ ...current, image: String(reader.result) }));
      reader.readAsDataURL(file);
    }
  };

  const resetResourceForm = () => {
    setEditingResourceId(null);
    setResourceForm({ title: '', type: 'Testas', category: '', image: '', imageUrl: '', html: '', htmlUrl: '', validityMonths: 12, requiredSigners: ['Darbuotojas'] });
    setDraftQuestions([{ prompt: '', options: ['', ''], correctIndex: 0 }]);
  };

  const getResourceWithHtml = async (resource) => {
    if (resource.html || !resource.htmlUrl) return resource;
    const cached = resourceHtmlCacheRef.current.get(resource.id);
    if (cached) return cached;
    const request = fetch(resource.htmlUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Nepavyko įkelti HTML šablono: ${response.status}`);
      return { ...resource, html: await response.text() };
    });
    resourceHtmlCacheRef.current.set(resource.id, request);
    try {
      return await request;
    } catch (error) {
      resourceHtmlCacheRef.current.delete(resource.id);
      throw error;
    }
  };

  const editResource = async (resource) => {
    try {
      resource = await getResourceWithHtml(resource);
    } catch (error) {
      setNotice(`HTML šablono įkelti nepavyko: ${error.message}`);
      return;
    }
    setEditingResourceId(resource.id);
    setResourceForm({
      title: resource.title ?? '',
      type: resource.type ?? 'Testas',
      category: resource.category ?? '',
      image: resource.imageUrl ?? resource.image ?? '',
      imageUrl: resource.imageUrl ?? '',
      html: resource.html ?? '',
      htmlUrl: resource.htmlUrl ?? '',
      validityMonths: resource.validityMonths ?? 12,
      requiredSigners: resource.requiredSigners ?? ['Darbuotojas'],
    });
    setDraftQuestions(resource.questions?.length ? resource.questions.map((question) => ({ ...question, options: [...question.options] })) : [{ prompt: '', options: ['', ''], correctIndex: 0 }]);
    document.getElementById('resource-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const addResource = async (event) => {
    event.preventDefault();
    if (!resourceForm.title.trim() || resourceSaving || resourceFileUploading) return;
    const existingResource = data.resources.find((item) => item.id === editingResourceId);
    const questions = draftQuestions.map((question) => {
      const cleanedQuestion = { ...question, prompt: question.prompt.trim(), options: question.options.map((option) => option.trim()) };
      if (Array.isArray(question.correctIndices)) {
        delete cleanedQuestion.correctIndex;
        cleanedQuestion.correctIndices = question.correctIndices;
      } else {
        delete cleanedQuestion.correctIndices;
      }
      return cleanedQuestion;
    });
    if (resourceForm.type === 'Testas' && (!questions.length || questions.some((question) => !question.prompt || question.options.some((option) => !option)))) {
      setNotice('Užpildykite kiekvieną testo klausimą ir abu atsakymo variantus.');
      return;
    }
    if (resourceForm.type === 'Testas' && questions.some((question) => Array.isArray(question.correctIndices)
      ? !question.correctIndices.length || question.correctIndices.some((answerIndex) => !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.options.length)
      : !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.options.length)) {
      setNotice('Pažymėkite bent vieną teisingą atsakymą kiekviename klausime.');
      return;
    }
    setResourceSaving(true);
    let uploadedHtmlPath = null;
    try {
      let htmlUrl = resourceForm.html.trim() ? resourceForm.htmlUrl : '';
      if (cloudMode && userRole === 'kurejas' && resourceForm.html.trim()
        && resourceForm.html !== existingResource?.html
        && htmlUrl === (existingResource?.htmlUrl ?? '')) {
        const htmlFile = new File([resourceForm.html], `${editingResourceId ?? 'resource'}.html`, { type: 'text/html' });
        const uploadedHtml = await uploadCreatorAsset(htmlFile);
        htmlUrl = uploadedHtml.publicUrl;
        uploadedHtmlPath = uploadedHtml.path;
      }
      const resource = {
        ...existingResource,
        ...resourceForm,
        htmlUrl,
        id: editingResourceId ?? `res-${Date.now()}`,
        title: resourceForm.title.trim(),
        category: resourceForm.category.trim() || resourceTypeDisplayNames[resourceForm.type],
        validityMonths: Number(resourceForm.validityMonths) || 12,
        questions: resourceForm.type === 'Testas' ? questions : [],
        signatures: true,
      };
      if (cloudMode && userRole === 'kurejas') {
        const { error } = await supabase.rpc('save_creator_resource', {
          input_resource: resourceForDatabase(resource),
          input_resource_types: data.resourceTypes,
        });
        if (error) throw error;
      }
      setData((current) => ({ ...current, resources: editingResourceId ? current.resources.map((item) => item.id === editingResourceId ? resource : item) : [resource, ...current.resources] }));
      setNotice(editingResourceId ? 'Turinio šablonas atnaujintas.' : 'Turinio šablonas įtrauktas į bendrą biblioteką.');
      resetResourceForm();
    } catch (error) {
      if (uploadedHtmlPath) {
        const { error: cleanupError } = await supabase.storage.from('dsspro-assets').remove([uploadedHtmlPath]);
        if (cleanupError) setNotice(`Šablono išsaugoti nepavyko: ${error.message}. Įkeltą failą pašalinti nepavyko: ${cleanupError.message}`);
        else setNotice(`Šablono išsaugoti nepavyko: ${error.message}`);
      } else {
        setNotice(`Šablono išsaugoti nepavyko: ${error.message}`);
      }
    } finally {
      setResourceSaving(false);
    }
  };

  const deleteCreatorResource = async (resource) => {
    if (!window.confirm(`Ar tikrai norite ištrinti „${resource.title}“? Šablonas bus pašalintas iš kūrėjo bibliotekos ir gali būti pašalintas iš įmonių priskyrimų.`)) return;
    if (cloudMode) {
      const { data: deleted, error } = await supabase.rpc('delete_creator_resource', { input_resource_id: resource.id });
      if (error || !deleted) {
        setNotice(`Šablono ištrinti nepavyko: ${error?.message ?? 'šablonas nerastas arba jau ištrintas.'}`);
        return;
      }
    }

    setData((current) => ({
      ...current,
      resources: current.resources.filter((item) => item.id !== resource.id),
      organizations: current.organizations.map((org) => ({ ...org, resources: org.resources.filter((id) => id !== resource.id) })),
      employees: current.employees.map((employee) => ({ ...employee, resourceIds: employee.resourceIds.filter((id) => id !== resource.id) })),
    }));
    setNotice(`Šablonas „${resource.title}“ ištrintas.`);
  };

  const deleteCreatorArchivedEmployees = async (organization, archiveIds = null) => {
    if (!cloudMode || !(userRole === 'kurejas' || (userRole === 'vadovas' && creatorReadOnlyPreview))) return;
    const records = (data.archivedEmployees ?? []).filter((record) => record.orgId === organization.id
      && (archiveIds === null || archiveIds.includes(record.id)));
    if (!records.length) return;
    const employeeNames = records.map((record) => record.employee.name).join(', ');
    if (!window.confirm(`Ištrinti ${records.length === 1 ? 'archyvo įrašą' : `visus ${records.length} archyvo įrašus`} įmonėje „${organization.name}“? Bus pašalinti darbuotojų duomenys, parašai, testų rezultatai ir protokolų priskyrimai. Tai negrįžtama.`)) return;

    const { data: deletedCount, error } = await supabase.rpc('creator_delete_archived_employees', {
      input_organization_id: organization.id,
      input_archive_ids: archiveIds,
    });
    if (error) {
      setNotice(`Archyvo ištrinti nepavyko: ${error.message}`);
      return;
    }

    const employeeIds = new Set(records.map((record) => record.employee.id));
    const recordIds = new Set(records.map((record) => record.id));
    const signaturePaths = [...new Set(records.flatMap((record) => record.signatures ?? []).map((signature) => signature.signaturePath).filter(Boolean))];
    if (signaturePaths.length) {
      const { error: storageError } = await supabase.storage.from('signature-assets').remove(signaturePaths);
      if (storageError) setNotice(`Archyvo įrašai ištrinti, bet parašų failus pašalinti nepavyko: ${storageError.message}`);
    }
    setData((current) => ({
      ...current,
      archivedEmployees: (current.archivedEmployees ?? []).filter((record) => !recordIds.has(record.id)),
      signatures: current.signatures.filter((signature) => signature.orgId !== organization.id || !employeeIds.has(signature.employeeId)),
      protocolBatches: (current.protocolBatches ?? []).map((batch) => batch.orgId === organization.id
        ? { ...batch, employeeIds: batch.employeeIds.filter((employeeId) => !employeeIds.has(employeeId)) }
        : batch).filter((batch) => batch.employeeIds.length > 0),
    }));
    setArchiveDetailsId(null);
    setNotice(`Ištrinta ${deletedCount} archyvo ${deletedCount === 1 ? 'įrašas' : 'įrašų'}: ${employeeNames}.`);
    await onCreatorWorkspaceChanged();
  };

  const deleteCreatorOrganization = async (organization) => {
    if (!cloudMode || userRole !== 'kurejas') return;
    const typedName = window.prompt(`Norėdami ištrinti visą įmonę ir jos duomenis, įrašykite tikslų pavadinimą:\n${organization.name}`);
    if (typedName?.trim() !== organization.name.trim()) return;
    if (!window.confirm(`Galutinai ištrinti „${organization.name}“? Bus pašalinti visi darbuotojai, archyvai, parašai, dokumentai, priskyrimai, prenumeratos ir susiję failai. Šio veiksmo atšaukti negalima.`)) return;

    const { data: result, error } = await supabase.functions.invoke('creator-delete-organization', {
      body: { organizationId: organization.id },
    });
    if (error) {
      const details = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null;
      setNotice(`Įmonės ištrinti nepavyko: ${details?.error ?? error.message}`);
      return;
    }
    if (!result?.deleted) {
      setNotice('Įmonės ištrinti nepavyko: Supabase nepatvirtino trynimo.');
      return;
    }

    if (result.storageCleanupComplete === false) {
      window.alert(`Įmonė ištrinta, bet dalies failų pašalinti nepavyko: ${result.warning}`);
    }
    await onCreatorOrganizationDeleted();
  };

  const saveCompanyProtocol = (event) => {
    event.preventDefault();
    const title = protocolTitle.trim();
    if (!protocolSource || !currentOrg || !title) return;
    const protocol = {
      ...protocolSource,
      id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      organizationId: currentOrg.id,
      sourceResourceId: protocolSource.id,
      type: 'Protokolas',
      questions: [],
      signatures: true,
      isProtocolTemplate: false,
    };
    setData((current) => ({
      ...current,
      resources: [protocol, ...current.resources],
      organizations: current.organizations.map((org) => org.id === currentOrg.id
        ? { ...org, resources: [...new Set([...org.resources, protocol.id])] }
        : org),
    }));
    setProtocolSource(null);
    setProtocolTitle('');
    setNotice(`Protokolas „${title}“ išsaugotas įmonės bibliotekoje.`);
  };

  const openCompanyProtocolForm = (resource) => {
    setProtocolSource(resource);
    setProtocolTitle('');
  };

  const deleteCompanyProtocol = (resource) => {
    if (resource.type !== 'Protokolas' || resource.organizationId !== currentOrg?.id) return;
    if (!window.confirm(`Ištrinti protokolą „${resource.title}“ iš įmonės bibliotekos?`)) return;
    setData((current) => ({
      ...current,
      resources: current.resources.filter((item) => item.id !== resource.id),
      organizations: current.organizations.map((org) => org.id === currentOrg.id
        ? { ...org, resources: org.resources.filter((id) => id !== resource.id) }
        : org),
      employees: current.employees.map((employee) => ({
        ...employee,
        resourceIds: employee.resourceIds.filter((id) => id !== resource.id),
      })),
    }));
    setNotice(`Protokolas „${resource.title}“ ištrintas.`);
  };

  const openResourcePreview = async (resource, { autoPrint = false, protocolBatchId = null, employeeId = null, commissionAssignments = data.commissionAssignments ?? [], protocolCommissionSignatures = data.protocolCommissionSignatures ?? [], templateOnly = userRole === 'kurejas' || (userRole === 'vadovas' && activeTab === 'biblioteka' && !currentOrg?.resources.includes(resource.id)) } = {}) => {
    if (userRole === 'darbuotojas' && resource.id === 'res-aap' && !hasSavedAapSizes(currentEmployee)) {
      setActiveTab('aap');
      setNotice('AAP dydžiai nenustatyti. Užpildykite batų, drabužių, kelnių ir striukės dydžius.');
      return;
    }
    try {
      resource = await getResourceWithHtml(resource);
    } catch (error) {
      setNotice(`HTML šablono įkelti nepavyko: ${error.message}`);
      return;
    }
    const aapCatalogPreview = resource.id === 'res-aap' && userRole === 'vadovas' && activeTab === 'biblioteka';
    const companySettings = templateOnly ? {} : currentOrg?.resourceSettings?.[resource.id] ?? {};
    const configuredResource = {
      ...resource,
      defaultSettings: { ...resource.defaultSettings, ...companySettings },
      requiredSigners: companySettings.requiredSigners ?? resource.requiredSigners,
      validityMonths: companySettings.validityMonths ?? resource.validityMonths,
    };
    const protocolBatch = (data.protocolBatches ?? []).find((batch) => batch.id === protocolBatchId);
    const activeEmployees = templateOnly ? [] : protocolBatch
      ? protocolBatch.employeeIds.map((employeeId) => data.employees.find((item) => item.id === employeeId)).filter(Boolean)
      : userRole === 'darbuotojas'
        ? [currentEmployee].filter((item) => item?.resourceIds?.includes(resource.id))
        : data.employees.filter((item) => item.orgId === currentOrg?.id && item.resourceIds?.includes(resource.id));
    const archivedEmployees = templateOnly || userRole === 'darbuotojas' ? [] : protocolBatch
      ? protocolBatch.employeeIds.map((employeeId) => data.archivedEmployees?.find((item) => item.employee.id === employeeId)?.employee).filter(Boolean)
      : (data.archivedEmployees ?? []).filter((item) => item.orgId === currentOrg?.id && item.employee.resourceIds?.includes(resource.id)).map((item) => item.employee);
    const organizationEmployees = [
      ...data.employees.filter((item) => item.orgId === currentOrg?.id),
      ...(data.archivedEmployees ?? []).filter((item) => item.orgId === currentOrg?.id).map((item) => item.employee),
    ];
    const employeeSequenceNumbers = new Map(organizationEmployees.map((item, index) => [item.id, index + 1]));
    const previewEmployees = [...activeEmployees, ...archivedEmployees]
      .filter((person) => !employeeId || person.id === employeeId)
      .map((person) => ({ ...person, sequenceNumber: person.sequenceNumber ?? employeeSequenceNumbers.get(person.id) ?? '' }));
    const previewEmployeeIds = new Set(previewEmployees.map((person) => person.id));
    let previewSignatures = [];
    if (!templateOnly) {
      previewSignatures = await hydrateSignatureImages(data.signatures.filter((signature) =>
        signature.resourceId === resource.id && previewEmployeeIds.has(signature.employeeId)));
      protocolCommissionSignatures = await hydrateSignatureImages(protocolCommissionSignatures);
    }
    const workerSignedPreview = userRole === 'darbuotojas' && Boolean(currentEmployee && hasCurrentWorkerSignature(currentEmployee.id, resource.id));
    const previewDocument = { ...configuredResource, image: '', previewSpecialists: templateOnly ? [] : data.specialists, previewEmployees, previewCommissionAssignments: commissionAssignments, previewProtocolCommissionSignatures: protocolCommissionSignatures, templateOnly, aapCatalogPreview, previewResources: data.resources, workerSignedPreview, protocolBatchId, protocolBatchDate: protocolBatch?.protocolDate ?? '', protocolDateText: protocolBatch?.protocolDate ? formatProtocolDate(protocolBatch.protocolDate) : protocolBatch?.cadence === 'until-full' ? 'Pildomas' : '', protocolNumber: protocolBatch ? String(protocolBatch.number).padStart(3, '0') : '' };
    previewDocument.printHtml = prepareResourcePrintHtml(buildResourcePreviewHtml(previewDocument, currentEmployee, currentOrg, previewSignatures), resource.title);
    if (autoPrint) {
      printPdfHtml(previewDocument.printHtml, resource.title)
        .catch((error) => setNotice(`PDF atsisiųsti nepavyko: ${error.message}`));
      return;
    }
    setPreviewResource(previewDocument);
    setQuizAnswers({});
    setQuizResult(null);
    setReadConfirmed(false);
    if (!templateOnly && userRole === 'darbuotojas' && currentEmployee && !hasCurrentWorkerSignature(currentEmployee.id, resource.id) && currentEmployee.progressByResource?.[resource.id] !== 'completed') {
      setData((current) => ({ ...current, employees: current.employees.map((employee) => employee.id === currentEmployee.id ? { ...employee, progressByResource: { ...employee.progressByResource, [resource.id]: 'started' } } : employee) }));
    }
  };

  const submitQuiz = async (event) => {
    event.preventDefault();
    const questions = previewResource?.questions ?? [];
    const correctCount = questions.filter((question, index) => {
      if (Array.isArray(question.correctIndices)) {
        const selected = quizAnswers[index] ?? [];
        return selected.length === question.correctIndices.length && question.correctIndices.every((answerIndex) => selected.includes(String(answerIndex)));
      }
      return Number(quizAnswers[index]) === question.correctIndex;
    }).length;
    let score = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
    let passed = score >= 80;
    let completedAt = new Date().toISOString();
    let verifiedIp = null;
    if (cloudMode && userRole === 'darbuotojas') {
      const { data: result, error } = await supabase.rpc('submit_employee_test', {
        input_resource_id: previewResource.id,
        input_answers: questions.map((_, index) => quizAnswers[index] ?? null),
      });
      if (error) {
        setNotice(`Testo rezultato išsaugoti nepavyko: ${error.message}`);
        return;
      }
      score = result.score;
      passed = result.passed;
      completedAt = result.completedAt;
      verifiedIp = result.ip;
    }
    const result = { resourceId: previewResource.id, score, passed, completedAt, ip: verifiedIp ?? '127.0.0.1 (demo)' };
    setQuizResult({ resourceId: previewResource.id, score, passed });
    setData((current) => {
      const employee = current.employees.find((item) => item.id === currentEmployee.id);
      if (!employee) return current;
      const updatedEmployee = {
        ...employee,
        testResults: [...(employee.testResults ?? []), result],
        progressByResource: passed ? { ...employee.progressByResource, [previewResource.id]: 'completed' } : employee.progressByResource,
      };
      const { batches, resourceIds } = addEmployeeToProtocolBatches(current, updatedEmployee);
      return {
        ...current,
        employees: current.employees.map((item) => item.id === employee.id ? { ...updatedEmployee, resourceIds } : item),
        protocolBatches: batches,
      };
    });
  };

  const inviteEmployee = async (event) => {
    event.preventDefault();
    const inviteDialog = event.currentTarget?.closest('dialog');
    const name = `${employeeForm.firstName.trim()} ${employeeForm.lastName.trim()}`.trim();
    const email = employeeForm.email.trim().toLowerCase();
    const contractNumber = employeeForm.contractNumber.trim();
    if (!name || !email || !contractNumber || employeeEmailError || employeeContractNumberError) return;
    const invitedAt = new Date().toISOString();
    const invitedEmployee = {
      id: `emp-${crypto.randomUUID()}`, orgId: currentOrg.id, name, email, contractNumber, position: employeeForm.position.trim() || 'Darbuotojas', status: 'Pakviestas', inviteCount: 1, invitedAt,
      medicalCertificateValidUntil: employeeForm.medicalCertificateValidUntil || '',
      medicalCertificateReminderDate: getMedicalCertificateReminderDate(employeeForm.medicalCertificateValidUntil),
      resourceIds: inviteResourceIds.filter((resourceId) => currentOrg.resources.includes(resourceId)), sizes: { shoes: '', clothes: '', pants: '', jacket: '', height: '', weight: '', helmet: '' }, pin: '',
    };
    const { batches, resourceIds } = addEmployeeToProtocolBatches(data, invitedEmployee);
    const employeeToInvite = { ...invitedEmployee, resourceIds };
    setInviteSubmitting(true);
    try {
      if (cloudMode) {
        const { error } = await supabase.functions.invoke('invite-employee', {
          body: {
            organizationId: currentOrg.id,
            employee: employeeToInvite,
            protocolBatches: batches,
            redirectTo: window.location.origin,
          },
        });
        if (error) {
          let message = error.message;
          if (error.context instanceof Response) {
            const details = await error.context.clone().json().catch(() => null);
            message = details?.error ?? message;
          }
          throw new Error(message);
        }
      }
      setData((current) => ({
        ...current,
        employees: [...current.employees, employeeToInvite],
        protocolBatches: batches,
      }));
      setEmployeeForm({ firstName: '', lastName: '', email: '', contractNumber: '', position: '', medicalCertificateValidUntil: '' });
      setEmployeeSearch('');
      setEmployeePage(Math.ceil((orgEmployees.length + 1) / employeePageSize));
      setNotice(cloudMode ? `Kvietimo nuoroda išsiųsta ${email}. Darbuotojas susikurs slaptažodį ir pasirašymo PIN.` : `Kvietimas ${email} paruoštas demo aplinkoje.`);
      inviteDialog?.close();
    } catch (error) {
      setNotice(`Darbuotojo pakviesti nepavyko: ${error.message || 'patikrinkite el. pašto siuntimo nustatymus.'}`);
    } finally {
      setInviteSubmitting(false);
    }
  };

  const saveAssignmentPreset = (event) => {
    event.preventDefault();
    if (!currentOrg || !assignmentPresetDraft.name.trim()) return;
    const availableResourceIds = new Set(currentOrg.resources);
    const resourceIds = [...new Set(assignmentPresetDraft.resourceIds)].filter((id) => availableResourceIds.has(id));
    if (!resourceIds.length) return;
    const preset = { id: assignmentPresetDraft.id || `assignment-preset-${Date.now()}`, name: assignmentPresetDraft.name.trim(), resourceIds };
    updateOrg(currentOrg.id, (org) => ({
      ...org,
      employeeAssignmentPresets: [...(org.employeeAssignmentPresets ?? []).filter((item) => item.id !== preset.id), preset],
    }));
    setAssignmentPresetDraft({ id: '', name: '', resourceIds: [] });
    setNotice(`Darbuotojų ruošinys „${preset.name}“ išsaugotas.`);
  };

  const deleteAssignmentPreset = (preset) => {
    if (!currentOrg || !window.confirm(`Pašalinti ruošinį „${preset.name}“?`)) return;
    updateOrg(currentOrg.id, (org) => ({
      ...org,
      employeeAssignmentPresets: (org.employeeAssignmentPresets ?? []).filter((item) => item.id !== preset.id),
    }));
    if (selectedAssignmentPresetId === preset.id) setSelectedAssignmentPresetId('');
    setNotice(`Darbuotojų ruošinys „${preset.name}“ pašalintas.`);
  };

  const resendEmployeeInvite = (employeeId) => {
    setData((current) => ({ ...current, employees: current.employees.map((employee) => employee.id === employeeId ? { ...employee, inviteCount: (employee.inviteCount ?? 1) + 1 } : employee) }));
    const employee = data.employees.find((person) => person.id === employeeId);
    setNotice(`Kvietimas ${employee?.email} paruoštas pakartotinai. El. laiško siuntimas neprijungtas.`);
  };

  const remindEmployee = (employee) => {
    if (employee.status === 'Pakviestas') {
      resendEmployeeInvite(employee.id);
      return;
    }
    const pendingResources = (employee.resourceIds ?? []).map((resourceId) => data.resources.find((resource) => resource.id === resourceId)).filter(Boolean).filter((resource) => ['todo', 'started', 'unsigned', 'expired'].includes(getTaskStatus(employee, resource).key));
    if (!pendingResources.length) {
      setNotice(`${employee.name} neturi darbuotojo veiksmų, kuriuos reikėtų priminti.`);
      return;
    }
    setData((current) => ({ ...current, employees: current.employees.map((person) => person.id === employee.id ? { ...person, reminderCount: (person.reminderCount ?? 0) + 1, lastReminderAt: new Date().toISOString() } : person) }));
    setNotice(`Priminimas ${employee.name} paruoštas dėl: ${pendingResources.map((resource) => resource.title).join(', ')}. El. laiškų siuntimas neprijungtas.`);
  };

  const deleteEmployee = (employee) => {
    if (hasEmployeeSignatures(employee.id)) {
      setNotice(`${employee.name} turi pasirašytų dokumentų. Ištrinti negalima, darbuotoją perkelkite į archyvą.`);
      return;
    }
    if (!window.confirm(`Ištrinti ${employee.name}? Darbuotojas nėra pasirašęs dokumentų.`)) return;
    setData((current) => {
      const protocolBatches = (current.protocolBatches ?? []).map((batch) => {
        const employeeIds = batch.employeeIds.filter((employeeId) => employeeId !== employee.id);
        return {
          ...batch,
          employeeIds,
          ...(batch.cadence === 'until-full' && employeeIds.length < protocolBatchCapacity ? { periodEnd: '', protocolDate: '' } : {}),
        };
      }).filter((batch) => batch.employeeIds.length > 0);
      return {
        ...current,
        employees: current.employees.filter((person) => person.id !== employee.id),
        protocolBatches,
      };
    });
    setNotice(`${employee.name} ištrintas.`);
  };

  const archiveEmployee = (employee) => {
    if (!window.confirm(`Perkelti ${employee.name} į nekintamą archyvą? Jo duomenys ir parašai bus išsaugoti.`)) return;
    const archivedAt = new Date().toISOString();
    setData((current) => {
      const employeeToArchive = current.employees.find((person) => person.id === employee.id);
      if (!employeeToArchive) return current;
      const employeeSnapshot = { ...employeeToArchive };
      delete employeeSnapshot.pin;
      const org = current.organizations.find((item) => item.id === employeeToArchive.orgId);
      const signatures = current.signatures.filter((signature) => signature.employeeId === employeeToArchive.id).map((signature) => ({ ...signature }));
      const resources = (employeeToArchive.resourceIds ?? []).map((resourceId) => current.resources.find((resource) => resource.id === resourceId)).filter(Boolean).map((resource) => ({ ...resource }));
      const record = {
        id: `archive-${employeeToArchive.id}-${Date.now()}`,
        orgId: employeeToArchive.orgId,
        organization: org ? { id: org.id, name: org.name, companyCode: org.companyCode } : null,
        employee: { ...employeeSnapshot, status: 'Atleistas' },
        resources,
        signatures,
        archivedAt,
      };
      return {
        ...current,
        employees: current.employees.filter((person) => person.id !== employeeToArchive.id),
        archivedEmployees: [record, ...(current.archivedEmployees ?? [])],
      };
    });
    setNotice(`${employee.name} perkeltas į archyvą. Darbuotojo duomenys ir parašų įrašai išsaugoti.`);
  };

  const openEmployeeDetails = (employeeId) => {
    setEmployeeDetailsId(employeeId);
    document.getElementById('employee-details-dialog')?.showModal();
  };

  const openEmployeeEditor = (employee) => {
    setEditingEmployeeId(employee.id);
    setEmployeePositionDraft(employee.position || 'Darbuotojas');
    setEmployeeResourceDraft(employee.resourceIds ?? []);
    setEmployeeSignerDraft(Object.fromEntries((employee.resourceIds ?? []).map((resourceId) => {
      const resource = data.resources.find((item) => item.id === resourceId);
      return [resourceId, getRequiredSigners(resource, currentOrg, employee)];
    }).filter(([, roles]) => roles)));
    document.getElementById('employee-edit-dialog')?.showModal();
  };

  const closeEmployeeEditor = () => {
    document.getElementById('employee-edit-dialog')?.close();
    setEditingEmployeeId(null);
    setEmployeePositionDraft('');
    setEmployeeResourceDraft([]);
    setEmployeeSignerDraft({});
  };

  const saveEmployeeAssignments = async () => {
    if (!employeeBeingEdited || employeeAssignmentSaving) return;
    const availableResourceIds = new Set(currentOrg.resources);
    const resourceIds = employeeResourceDraft.filter((resourceId) => availableResourceIds.has(resourceId));
    const requiredSignersByResource = Object.fromEntries(resourceIds.map((resourceId) => {
      const resource = data.resources.find((item) => item.id === resourceId);
      const roles = employeeSignerDraft[resourceId] ?? getRequiredSigners(resource, currentOrg, employeeBeingEdited);
      return [resourceId, [...new Set(['Darbuotojas', ...roles])]];
    }));
    const position = employeePositionDraft.trim() || 'Darbuotojas';
    const employee = data.employees.find((item) => item.id === employeeBeingEdited.id);
    if (!employee) return;
    const updatedEmployee = { ...employee, position, resourceIds, requiredSignersByResource };
    const { batches, resourceIds: protocolResourceIds } = addEmployeeToProtocolBatches(data, updatedEmployee);
    const currentBatchesById = new Map((data.protocolBatches ?? []).map((batch) => [batch.id, batch]));
    const changedProtocolBatches = batches.filter((batch) => batch.employeeIds.includes(employee.id)
      && JSON.stringify(currentBatchesById.get(batch.id)) !== JSON.stringify(batch));
    const applyAssignmentsToWorkspace = (current) => ({
      ...current,
      employees: current.employees.map((item) => item.id === employee.id
        ? { ...item, position, resourceIds: protocolResourceIds, requiredSignersByResource }
        : item),
      protocolBatches: changedProtocolBatches.reduce((currentBatches, changedBatch) => {
        const existingBatch = currentBatches.find((batch) => batch.id === changedBatch.id);
        if (!existingBatch) return [...currentBatches, changedBatch];
        return currentBatches.map((batch) => batch.id === changedBatch.id
          ? {
            ...batch,
            periodEnd: changedBatch.periodEnd,
            protocolDate: changedBatch.protocolDate,
            employeeIds: [...new Set([...batch.employeeIds, employee.id])],
          }
          : batch);
      }, current.protocolBatches ?? []),
    });

    if (cloudMode && !creatorReadOnlyPreview) {
      const hasPendingWorkspaceChanges = workspaceAutosaveTimeoutRef.current !== null;
      setEmployeeAssignmentSaving(true);
      employeeAssignmentRpcInFlightRef.current = true;
      try {
        const previousAutosaveError = await workspaceAutosaveRequestRef.current;
        const { error } = await supabase.rpc('save_organization_employee', {
          input_organization_id: currentOrg.id,
          input_employee_id: employee.id,
          input_position: position,
          input_resource_ids: protocolResourceIds,
          input_required_signers: requiredSignersByResource,
          input_protocol_batches: changedProtocolBatches,
        });
        if (error) {
          setNotice(`Darbuotojo priskyrimų išsaugoti nepavyko: ${error.message}`);
          return;
        }

        skipNextWorkspaceAutosaveRef.current = !hasPendingWorkspaceChanges;
        setData(applyAssignmentsToWorkspace);
        setNotice(previousAutosaveError
          ? `Darbuotojo priskyrimai išsaugoti, tačiau ankstesnis bendras įmonės išsaugojimas nepavyko: ${previousAutosaveError.message}`
          : `${employeeBeingEdited.name} pareigos, dokumentų ir pasirašančiųjų priskyrimai išsaugoti.`);
        closeEmployeeEditor();
      } catch (error) {
        setNotice(`Darbuotojo priskyrimų išsaugoti nepavyko: ${error.message}`);
      } finally {
        employeeAssignmentRpcInFlightRef.current = false;
        setEmployeeAssignmentSaving(false);
      }
      return;
    }

    setData(applyAssignmentsToWorkspace);
    setNotice(`${employeeBeingEdited.name} pareigos, dokumentų ir pasirašančiųjų priskyrimai išsaugoti.`);
    closeEmployeeEditor();
  };

  const inviteSpecialist = async (specialist) => {
    if (cloudMode) {
      const { data: invitation, error } = await supabase.functions.invoke('invite-dss-specialist', {
        body: { organizationId: currentOrg.id, email: specialist.email, redirectTo: window.location.origin },
      });
      if (error) {
        let message = error.message;
        if (error.context instanceof Response) {
          const details = await error.context.clone().json().catch(() => null);
          message = details?.error ?? message;
        }
        setNotice(`DSS specialisto pakviesti nepavyko: ${message}`);
        return;
      }
      setData((current) => ({
        ...current,
        dssInvitations: [
          ...(current.dssInvitations ?? []).filter((item) => item.id !== invitation.invitationId),
          {
            id: invitation.invitationId,
            organization_id: currentOrg.id,
            organization_name: invitation.organizationName,
            specialist_user_id: invitation.userId,
            invited_email: invitation.email,
            invited_name: invitation.fullName,
            created_at: new Date().toISOString(),
          },
        ],
      }));
      setSpecialistQuery('');
      setNotice(invitation.invited
        ? `Kvietimo nuoroda išsiųsta ${invitation.email}. Prieiga prie įmonės bus suteikta tik specialistui sutikus.`
        : `Kvietimas pateiktas ${invitation.email}. Prieiga prie įmonės bus suteikta tik specialistui sutikus.`);
      return;
    }
    if (currentOrg.dss.includes(specialist.id) || currentOrg.dssInvitations?.some((invite) => invite.specialistId === specialist.id)) {
      setNotice(`${specialist.name} jau priskirtas arba pakviestas į šią įmonę.`);
      return;
    }
    updateOrg(currentOrg.id, (org) => ({ ...org, dssInvitations: [...(org.dssInvitations ?? []), { specialistId: specialist.id, status: 'Laukia patvirtinimo' }] }));
    setNotice(`${specialist.name} kvietimas paruoštas (${specialist.email}). Priskyrimas įsigalios specialistui jį priėmus.`);
    setSpecialistQuery('');
  };

  const acceptSpecialistInvite = (orgId, specialistId) => {
    updateOrg(orgId, (org) => ({
      ...org,
      dss: [...new Set([...org.dss, specialistId])],
      dssInvitations: (org.dssInvitations ?? []).filter((invite) => invite.specialistId !== specialistId),
    }));
    setNotice('DSS specialisto kvietimas priimtas. Įmonė atsirado jo prižiūrimų įmonių sąraše.');
  };

  const respondToDssInvitation = async (invitation, accept) => {
    setDssInvitationActionId(invitation.id);
    try {
      const { error } = await supabase.rpc('respond_dss_specialist_invitation', {
        input_invitation_id: invitation.id,
        input_accept: accept,
      });
      if (error) throw error;
      const refreshedWorkspace = await onRefreshWorkspace();
      if (refreshedWorkspace?.dss && refreshedWorkspace.data) {
        setData((current) => ({ ...current, ...refreshedWorkspace.data }));
        if (accept) setSelectedOrgId(invitation.organization_id);
        setDssWorkspaceLoadState({ organizationId: '', status: 'idle', error: '' });
      }
      setNotice(accept
        ? `Sutikote prižiūrėti įmonę „${invitation.organization_name}“. Ji pridėta prie jūsų darbo sričių.`
        : `Kvietimo prižiūrėti įmonę „${invitation.organization_name}“ atsisakyta.`);
    } catch (error) {
      setNotice(`Kvietimo atnaujinti nepavyko: ${error.message}`);
    } finally {
      setDssInvitationActionId('');
    }
  };

  const revokeDssSpecialist = async (specialist) => {
    if (!window.confirm(`Ar tikrai pašalinti ${specialist.name} iš įmonės „${currentOrg?.name}“?\n\nSpecialisto prieiga prie šios įmonės bus panaikinta. Jau pasirašyti dokumentai ir parašų istorija liks išsaugoti. Specialisto paskyra nebus ištrinta.`)) return;
    setDssRevokeSubmittingId(specialist.id);
    try {
      const { error } = await supabase.rpc('revoke_dss_specialist', {
        input_organization_id: currentOrg.id,
        input_specialist_user_id: specialist.id,
      });
      if (error) throw error;
      setData((current) => ({
        ...current,
        organizations: current.organizations.map((organization) => organization.id === currentOrg.id
          ? { ...organization, dss: organization.dss.filter((id) => id !== specialist.id) }
          : organization),
      }));
      setNotice(`${specialist.name} pašalintas iš įmonės. Paskyra ir visi ankstesni parašai išsaugoti.`);
    } catch (error) {
      setNotice(`DSS specialisto pašalinti nepavyko: ${error.message}`);
    } finally {
      setDssRevokeSubmittingId('');
    }
  };

  const refreshDssAssignments = async () => {
    setDssRefreshSubmitting(true);
    try {
      const refreshedWorkspace = await onRefreshWorkspace();
      if (!refreshedWorkspace?.data) throw new Error('Įmonės duomenys negrąžinti.');
      setData((current) => ({ ...current, ...refreshedWorkspace.data }));
      setNotice('DSS specialistų ir laukiančių kvietimų sąrašas atnaujintas.');
    } catch (error) {
      setNotice(`DSS specialistų sąrašo atnaujinti nepavyko: ${error.message}`);
    } finally {
      setDssRefreshSubmitting(false);
    }
  };

  const requestDssSign = (tasks) => {
    if (!cloudMode && !currentSpecialist?.pin) {
      setActiveTab('paskyra');
      setNotice('Prieš pasirašydami dokumentus, nustatykite 4 skaitmenų PIN.');
      return;
    }
    setDssSigningTasks(tasks);
    setSignatureInk('');
    setSignPinDraft('');
    setDssReviewConfirmed(false);
    setDssSigningError('');
  };

  const signDssTask = async (event) => {
    event.preventDefault();
    const specialist = data.specialists.find((person) => person.id === selectedSpecialistId);
    if (!cloudMode && (!specialist?.pin || signPinDraft !== specialist.pin)) {
      setDssSigningError('PIN neteisingas arba dar nenustatytas.');
      return;
    }
    if (dssSigningTasks.length > 1 && !dssReviewConfirmed) {
      setDssSigningError('Patvirtinkite, kad peržiūrėjote visus pasirinktus dokumentus.');
      return;
    }
    if (!signatureInk) {
      setDssSigningError('Nupieškite parašą prieš patvirtindami PIN.');
      return;
    }
    const tasksToSign = dssSigningTasks.filter((task) => dssTasks.some((pendingTask) => pendingTask.id === task.id));
    if (!tasksToSign.length) {
      setDssSigningError('Pasirašytinų dokumentų nebėra.');
      return;
    }
    if (cloudMode) {
      const signatures = [];
      for (const task of tasksToSign) {
        let uploadedSignature;
        try {
          uploadedSignature = await uploadSignatureDataUrl(task.orgId, signatureInk);
        } catch (error) {
          if (signatures.length) setData((current) => ({ ...current, signatures: [...current.signatures, ...signatures] }));
          setDssSigningError(`Parašo įkelti nepavyko: ${error.message}`);
          return;
        }
        const { data: signature, error } = await supabase.rpc('record_dss_signature_with_image', {
          input_organization_id: task.orgId,
          input_employee_id: task.employeeId,
          input_resource_id: task.resourceId,
          input_pin: signPinDraft,
          input_signature_image: uploadedSignature.path,
        });
        if (error || !signature) {
          await removeSignatureAsset(uploadedSignature.path);
          if (signatures.length) setData((current) => ({ ...current, signatures: [...current.signatures, ...signatures] }));
          setDssSigningError(error?.message || 'PIN neteisingas arba per daug kartų bandyta.');
          return;
        }
        signatures.push({ ...signature, signaturePath: uploadedSignature.path });
      }
      setData((current) => ({ ...current, signatures: [...current.signatures, ...signatures] }));
    } else {
      const signedAt = new Date().toISOString();
      setData((current) => ({ ...current, signatures: [...current.signatures, ...tasksToSign.map((task, index) => {
        const employee = current.employees.find((person) => person.id === task.employeeId);
        const resource = current.resources.find((item) => item.id === task.resourceId);
        return {
          id: `sig-${Date.now()}-${index}`,
          orgId: task.orgId,
          employeeId: task.employeeId,
          contractNumber: employee?.contractNumber ?? task.contractNumber ?? '',
          resourceId: task.resourceId,
          signer: specialist.name,
          role: 'DSS specialistas',
          signatureMethod: 'PIN',
          signedAt,
          validUntil: getValidityUntil(resource?.validityMonths),
          signatureImage: signatureInk,
          ip: '127.0.0.1 (demo)',
        };
      })] }));
    }
    setDssSigningTasks([]);
    setSignPinDraft('');
    setDssReviewConfirmed(false);
    setDssSigningError('');
    setSelectedDssTaskIds([]);
    setSignatureInk('');
    setNotice(`DSS dokumentai pasirašyti PIN kodu: ${tasksToSign.length}.`);
  };

  const saveManagerPin = (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(managerPinDraft) || managerPinDraft !== managerPinConfirm) {
      setNotice('Vadovo PIN turi būti 4 skaitmenys, o abu įrašai turi sutapti.');
      return;
    }
    updateOrg(currentOrg.id, (org) => ({ ...org, managerPin: managerPinDraft }));
    setManagerPinDraft('');
    setManagerPinConfirm('');
    setNotice('Vadovo pasirašymo PIN nustatytas šioje naršyklėje.');
  };

  const changeCloudManagerPin = async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(managerCurrentPin) || !/^\d{4}$/.test(managerPinDraft) || managerPinDraft !== managerPinConfirm) {
      setNotice('Įveskite seną PIN ir du kartus tą patį naują 4 skaitmenų PIN.');
      return;
    }
    const { data: changed, error } = await supabase.rpc('change_signing_pin', {
      input_current_pin: managerCurrentPin,
      input_new_pin: managerPinDraft,
    });
    if (error) {
      setNotice(`PIN pakeisti nepavyko: ${error.message}`);
      return;
    }
    if (!changed) {
      setNotice('Senas PIN neteisingas arba per daug kartų bandyta.');
      return;
    }
    setManagerCurrentPin('');
    setManagerPinDraft('');
    setManagerPinConfirm('');
    setNotice('Pasirašymo PIN pakeistas.');
  };

  const saveAapItems = (event) => {
    event.preventDefault();
    updateOrg(currentOrg.id, (org) => ({ ...org, aapItems: aapDraft.map((item) => ({ ...item, quantity: Number(item.quantity) || 0, unitPrice: Number(item.unitPrice) || 0 })) }));
    setNotice('AAP šablono pozicijos išsaugotos šiai įmonei. Pasirašyti dokumentai išlaikys savo užfiksuotą versiją.');
    document.getElementById('aap-settings')?.close();
  };

  const updateAapItem = (itemId, field, value) => {
    setAapDraft((items) => items.map((item) => item.id === itemId ? { ...item, [field]: value } : item));
  };

  const requestEmployerSign = (employee, resource) => {
    if (!cloudMode && (!currentOrg.managerPin || currentOrg.managerPin.length !== 4)) {
      setActiveTab('imone');
      setNotice('Įmonės nustatymuose vadovas turi susikurti 4 skaitmenų parašo PIN.');
      return;
    }
    setEmployerSigningTarget({ employeeId: employee.id, resourceId: resource.id, orgId: employee.orgId });
    setSignatureInk('');
    setEmployerSignPin('');
    setEmployerSignError('');
  };

  const confirmEmployerSign = async (event) => {
    event.preventDefault();
    const org = data.organizations.find((item) => item.id === employerSigningTarget.orgId);
    const employee = data.employees.find((item) => item.id === employerSigningTarget.employeeId);
    const resource = data.resources.find((item) => item.id === employerSigningTarget.resourceId);
    if (!org || !employee || !resource) {
      setEmployerSignError('Nepavyko rasti pasirašomo dokumento.');
      return;
    }
    if (!signatureInk) {
      setEmployerSignError('Nupieškite parašą prieš patvirtindami PIN.');
      return;
    }
    if (cloudMode) {
      let uploadedSignature;
      try {
        uploadedSignature = await uploadSignatureDataUrl(org.id, signatureInk);
      } catch (error) {
        setEmployerSignError(`Parašo įkelti nepavyko: ${error.message}`);
        return;
      }
      const { data: signature, error } = await supabase.rpc('record_manager_signature_with_image', {
        input_employee_id: employee.id,
        input_resource_id: resource.id,
        input_pin: employerSignPin,
        input_signature_image: uploadedSignature.path,
      });
      if (error) {
        await removeSignatureAsset(uploadedSignature.path);
        setEmployerSignError(error.message || 'Vadovo parašo įrašyti nepavyko.');
        return;
      }
      if (!signature) {
        await removeSignatureAsset(uploadedSignature.path);
        setEmployerSignError('PIN kodas neteisingas arba per daug kartų bandyta.');
        return;
      }
      setData((current) => ({ ...current, signatures: [...current.signatures, { ...signature, signaturePath: uploadedSignature.path }] }));
    } else {
      if (employerSignPin !== org.managerPin) {
        setEmployerSignError('Vadovo PIN kodas neteisingas.');
        return;
      }
      setData((current) => ({ ...current, signatures: [...current.signatures, {
        id: `sig-${Date.now()}`,
        orgId: org.id,
        employeeId: employee.id,
        contractNumber: employee.contractNumber ?? '',
        resourceId: resource.id,
        signer: org.manager,
        role: 'Vadovas',
        signatureMethod: 'PIN',
        signedAt: new Date().toISOString(),
        validUntil: getValidityUntil(resource.validityMonths),
        signatureImage: signatureInk,
        ip: '127.0.0.1 (demo)',
      }] }));
    }
    setEmployerSigningTarget(null);
    setEmployerSignPin('');
    setSignatureInk('');
    setNotice('Darbdavio parašas patvirtintas PIN kodu.');
  };

  const requestCommissionSign = (employee, resource, member) => {
    const org = data.organizations.find((item) => item.id === employee.orgId);
    const pinConfigured = cloudMode
      ? commissionPinStatus.organizationId === org?.id && commissionPinStatus.members[member]
      : org?.commissionPins?.[member];
    if (!pinConfigured) {
      setActiveTab('imone');
      setNotice(`Komisijos nariui „${member}“ įmonės nustatymuose pirmiausia reikia nustatyti asmeninį PIN.`);
      return;
    }
    setCommissionSigningTarget({ employeeId: employee.id, resourceId: resource.id, orgId: employee.orgId, member });
    setSignatureInk('');
    setActiveTab('imone');
    setCommissionSignPin('');
    setCommissionSignError('');
  };

  const saveCommissionPin = async (orgId, member, pin) => {
    if (!cloudMode) {
      updateOrg(orgId, (org) => ({ ...org, commissionPins: { ...org.commissionPins, [member]: pin } }));
      setNotice(`Komisijos nario „${member}“ PIN nustatytas.`);
      return true;
    }
    const { error } = await supabase.rpc('set_commission_signer_pin', {
      input_organization_id: orgId,
      input_signer_name: member,
      input_pin: pin,
    });
    if (error) {
      setNotice(`Komisijos PIN išsaugoti nepavyko: ${error.message}`);
      return false;
    }
    setCommissionPinStatus((current) => ({
      organizationId: orgId,
      members: { ...(current.organizationId === orgId ? current.members : {}), [member]: true },
    }));
    setNotice(`Komisijos nario „${member}“ PIN nustatytas.`);
    return true;
  };

  const confirmCommissionSign = async (event) => {
    event.preventDefault();
    const target = commissionSigningTarget;
    const org = data.organizations.find((item) => item.id === target?.orgId);
    const employee = data.employees.find((item) => item.id === target?.employeeId);
    const resource = data.resources.find((item) => item.id === target?.resourceId);
    if (!target || !org || !employee || !resource) {
      setCommissionSignError('Komisijos nario PIN kodas neteisingas.');
      return;
    }
    if (!signatureInk) {
      setCommissionSignError('Nupieškite parašą prieš patvirtindami PIN.');
      return;
    }
    if (cloudMode) {
      let uploadedSignature;
      try {
        uploadedSignature = await uploadSignatureDataUrl(org.id, signatureInk);
      } catch (error) {
        setCommissionSignError(`Parašo įkelti nepavyko: ${error.message}`);
        return;
      }
      const { data: signature, error } = await supabase.rpc('record_commission_signature_with_image', {
        input_organization_id: org.id,
        input_employee_id: employee.id,
        input_resource_id: resource.id,
        input_signer_name: target.member,
        input_pin: commissionSignPin,
        input_signature_image: uploadedSignature.path,
      });
      if (error) {
        await removeSignatureAsset(uploadedSignature.path);
        setCommissionSignError(error.message || 'Komisijos parašo įrašyti nepavyko.');
        return;
      }
      if (!signature) {
        await removeSignatureAsset(uploadedSignature.path);
        setCommissionSignError('PIN kodas neteisingas arba per daug kartų bandyta.');
        return;
      }
      setData((current) => ({ ...current, signatures: [...current.signatures, { ...signature, signaturePath: uploadedSignature.path }] }));
    } else {
      if (commissionSignPin !== org.commissionPins?.[target.member]) {
        setCommissionSignError('Komisijos nario PIN kodas neteisingas.');
        return;
      }
      setData((current) => ({ ...current, signatures: [...current.signatures, {
        id: `sig-${Date.now()}`,
        orgId: org.id,
        employeeId: employee.id,
        contractNumber: employee.contractNumber ?? '',
        resourceId: resource.id,
        signer: target.member,
        role: 'Komisijos narys',
        signatureMethod: 'PIN',
        signedAt: new Date().toISOString(),
        validUntil: getValidityUntil(resource.validityMonths),
        signatureImage: signatureInk,
        ip: '127.0.0.1 (demo)',
      }] }));
    }
    setCommissionSigningTarget(null);
    setCommissionSignPin('');
    setSignatureInk('');
    setNotice(`Komisijos nario „${target.member}“ parašas patvirtintas PIN kodu.`);
  };

  const updateSubscription = (subscriptionId, action) => {
    setData((current) => ({ ...current, subscriptions: current.subscriptions.map((subscription) => {
      if (subscription.id !== subscriptionId) return subscription;
      if (action === 'renew') return { ...subscription, status: 'Aktyvi', endsAt: '2027-10-13' };
      if (action === 'cancel') return { ...subscription, status: 'Atšaukta' };
      return { ...subscription, status: 'Aktyvi' };
    }) }));
    setNotice(action === 'cancel' ? 'Prenumerata atšaukta demo aplinkoje.' : 'Prenumerata pratęsta demo aplinkoje.');
  };

  const savePin = async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(pinDraft) || pinDraft !== pinConfirm) {
      setNotice('PIN turi būti 4 skaitmenys, o abu įrašai turi sutapti.');
      return;
    }
    if (cloudMode && ['darbuotojas', 'dss'].includes(userRole)) {
      if (!/^\d{4}$/.test(workerCurrentPin)) {
        setNotice('Įveskite dabartinį 4 skaitmenų PIN.');
        return;
      }
      const { data: changed, error } = await supabase.rpc('change_signing_pin', {
        input_current_pin: workerCurrentPin,
        input_new_pin: pinDraft,
      });
      if (error || !changed) {
        setNotice('PIN pakeisti nepavyko. Patikrinkite dabartinį PIN ir bandykite dar kartą.');
        return;
      }
      setWorkerCurrentPin('');
      setPinDraft('');
      setPinConfirm('');
      setNotice('Pasirašymo PIN pakeistas.');
      return;
    }
    if (userRole === 'dss') {
      setData((current) => ({ ...current, specialists: current.specialists.map((specialist) => specialist.id === selectedSpecialistId ? { ...specialist, pin: pinDraft } : specialist) }));
    } else {
      setData((current) => ({ ...current, employees: current.employees.map((employee) => employee.id === currentEmployee.id ? { ...employee, pin: pinDraft, status: employee.aapCompleted ? 'Aktyvus' : 'Pakviestas' } : employee) }));
    }
    setPinDraft('');
    setPinConfirm('');
    setNotice('Pasirašymo PIN nustatytas šioje naršyklėje.');
  };

  const changeDemoRole = (role) => {
    setActiveTab(role === 'darbuotojas' ? 'uzduotys' : 'skydelis');
    setMobileMenuOpen(false);
    if (role === 'darbuotojas') setTaskFilter('atliktinos');
    setNotificationsOpen(false);
    const organizations = role === 'dss' ? data.organizations.filter((org) => org.dss.includes(selectedSpecialistId) || org.dssInvitations?.some((invite) => invite.specialistId === selectedSpecialistId)) : data.organizations;
    if (organizations[0]) {
      setSelectedOrgId(organizations[0].id);
      setAapDraft(organizations[0].aapItems ?? defaultAapItems);
      if (role === 'darbuotojas') setSelectedEmployeeId(data.employees.find((employee) => employee.orgId === organizations[0].id)?.id ?? '');
    }
    onRoleChange(role);
  };

  const signedCount = data.signatures.filter((signature) => signature.orgId === currentOrg?.id).length;
  const pendingCount = orgEmployees.reduce((total, employee) => total + employee.resourceIds.filter((resourceId) => {
    const resource = data.resources.find((item) => item.id === resourceId);
    return resource && ['todo', 'started', 'unsigned', 'expired', 'awaitingDss', 'awaitingEmployer', 'awaitingCommission', 'awaitingSignatures'].includes(getTaskStatus(employee, resource).key);
  }).length, 0) + dssTasks.filter((task) => task.orgId === currentOrg?.id).length;
  const currentDateKey = toLocalDateKey(new Date(validityCheckTime));
  const updateMedicalCertificateDate = (employeeId, validUntil) => setData((current) => ({
    ...current,
    employees: current.employees.map((employee) => employee.id === employeeId
      ? {
        ...employee,
        medicalCertificateValidUntil: validUntil,
        medicalCertificateReminderDate: getMedicalCertificateReminderDate(validUntil),
      }
      : employee),
  }));
  const notifications = userRole === 'darbuotojas'
    ? [
      ...pendingResourceIds.map((resourceId) => {
      const resource = data.resources.find((item) => item.id === resourceId);
      return { id: resourceId, title: resource?.title ?? 'Priskirta užduotis', description: getTaskStatus(currentEmployee, resource).label, resource, employee: currentEmployee };
      }),
      ...pendingCommissionInvitations.map((invitation) => ({
        id: `commission-invitation-${invitation.id}`,
        title: 'Kvietimas į DSS komisiją',
        description: `${invitation.organizationName} · ${invitation.role}`,
        commissionInvitation: invitation,
      })),
      ...pendingCommissionTasks.map((task) => ({
        id: `commission-task-${task.assignmentId}-${task.batchId}`,
        title: `Pasirašyti protokolą · ${task.resourceTitle}`,
        description: `${task.role} · protokolas Nr. ${task.batchNumber}`,
        commissionTask: task,
      })),
    ]
    : userRole === 'dss'
      ? dssTasks.filter((task) => task.orgId === currentOrg?.id).map((task) => ({
        id: task.id,
        title: data.resources.find((item) => item.id === task.resourceId)?.title ?? 'Dokumentas',
        description: `${task.signer} · laukia DSS parašo`,
        task,
      }))
      : userRole === 'vadovas'
        ? [
          ...currentCommissionAssignments
            .filter((assignment) => assignment.status === 'accepted' && assignment.respondedAt)
            .map((assignment) => ({
              id: `commission-accepted-${assignment.id}`,
              title: 'Darbuotojas sutiko prisijungti prie komisijos',
              description: `${assignment.employeeName} sutiko būti ${assignment.role === 'Komisijos pirmininkas' ? 'komisijos pirmininku' : 'DSS komisijos nariu'}.`,
              commissionAcceptance: assignment,
            })),
          ...orgEmployees.flatMap((employee) => (employee.resourceIds ?? []).map((resourceId) => {
            const resource = data.resources.find((item) => item.id === resourceId);
            return resource && getTaskStatus(employee, resource).key === 'awaitingEmployer'
              ? { id: `${employee.id}-${resource.id}`, title: resource.title, description: `${employee.name} · laukia vadovo parašo`, employee, resource }
              : null;
          }).filter(Boolean)),
          ...orgEmployees.flatMap((employee) => (employee.resourceIds ?? []).map((resourceId) => {
            const resource = data.resources.find((item) => item.id === resourceId);
            if (!resource || getTaskStatus(employee, resource).key !== 'expired') return null;
            const lastWorkerSignature = data.signatures
              .filter((signature) => signature.employeeId === employee.id && signature.resourceId === resource.id && signature.role === 'Darbuotojas')
              .sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
            return {
              id: `expired-${employee.id}-${resource.id}`,
              title: 'Dokumento galiojimas pasibaigė',
              description: `${employee.name} · ${resource.title}${lastWorkerSignature?.validUntil ? ` · galiojo iki ${new Date(lastWorkerSignature.validUntil).toLocaleDateString('lt-LT')}` : ''}`,
              expiredResource: { employee, resource },
            };
          }).filter(Boolean)),
          ...orgEmployees
            .filter((employee) => employee.medicalCertificateReminderDate && employee.medicalCertificateReminderDate <= currentDateKey && !isDateExpired(employee.medicalCertificateValidUntil, validityCheckTime))
            .map((employee) => ({
              id: `medical-reminder-${employee.id}`,
              title: 'Netrukus baigsis medicininio pažymėjimo galiojimas',
              description: `${employee.name} · galioja iki ${new Date(`${employee.medicalCertificateValidUntil}T12:00:00`).toLocaleDateString('lt-LT')}`,
              medicalCertificateReminder: employee,
            })),
          ...orgEmployees
            .filter((employee) => isDateExpired(employee.medicalCertificateValidUntil, validityCheckTime))
            .map((employee) => ({
              id: `medical-expired-${employee.id}`,
              title: 'Pasibaigė medicininio pažymėjimo galiojimas',
              description: `${employee.name} · galiojo iki ${new Date(`${employee.medicalCertificateValidUntil}T12:00:00`).toLocaleDateString('lt-LT')}`,
              expiredMedicalCertificate: employee,
            })),
          ...orgEmployees.flatMap((employee) => (employee.resourceIds ?? []).flatMap((resourceId) => {
            const resource = data.resources.find((item) => item.id === resourceId);
            if (!resource || getTaskStatus(employee, resource).key !== 'awaitingCommission') return [];
            return getRequiredSignerEntries(employee, resource, currentOrg, data.signatures, validityCheckTime, data.specialists)
              .filter((signer) => signer.role === 'Komisijos narys' && signer.status !== 'signed')
              .map((signer) => ({ id: `${employee.id}-${resource.id}-${signer.name}`, title: resource.title, description: `${employee.name} · ${signer.name} laukia komisijos parašo`, employee, resource, commissionMember: signer.name }));
          })),
        ]
        : [];
  const displayName = userRole === 'dss' ? currentSpecialist?.name : userRole === 'vadovas' ? currentOrg?.manager : userRole === 'kurejas' ? 'DSS Pro komanda' : currentEmployee?.name;
  const changeEmployeeSort = (key) => setEmployeeSort((current) => ({
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }));
  const renderEmployeeSortHeader = (key, label, className = '', sortLabel = label, rowSpan = 1) => (
    <th rowSpan={rowSpan} aria-sort={employeeSort.key === key ? employeeSort.direction === 'asc' ? 'ascending' : 'descending' : 'none'} className={`px-2 py-3 ${className}`} key={key}>
      <button type="button" title={`Rikiuoti pagal: ${sortLabel}`} onClick={() => changeEmployeeSort(key)} className="relative grid w-full grid-cols-1 items-center text-center text-xs leading-tight hover:text-slate-900">
        <span className="w-full whitespace-normal text-center">{label}</span>{employeeSort.key === key ? <ChevronDown size={13} className={`absolute right-0 top-1/2 -translate-y-1/2 text-blue-700 ${employeeSort.direction === 'asc' ? 'rotate-180' : ''}`} /> : <ArrowUpDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-600" />}
      </button>
    </th>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900 lg:flex-row">
      <aside className="sticky top-0 z-40 flex w-full shrink-0 flex-col bg-emerald-950 px-3 py-2 text-white shadow-lg sm:px-4 sm:py-3 lg:static lg:z-auto lg:w-64 lg:px-4 lg:py-5 lg:shadow-none print:hidden">
        <div className="flex items-center justify-between lg:contents">
          <button onClick={() => { setActiveTab(userRole === 'darbuotojas' ? 'uzduotys' : 'skydelis'); setMobileMenuOpen(false); }} className="mb-0 flex items-center gap-2 px-2 text-left text-lg font-black lg:mb-6">Dss <span className="rounded-full border border-emerald-400 px-2 py-0.5 text-xs text-emerald-300">Pro</span></button>
          <button type="button" aria-label={mobileMenuOpen ? 'Uždaryti meniu' : 'Atidaryti meniu'} aria-expanded={mobileMenuOpen} aria-controls="workspace-mobile-menu" className="grid size-10 place-items-center rounded-md border border-white/20 text-white hover:bg-white/10 lg:hidden" onClick={() => setMobileMenuOpen((open) => !open)}><Menu size={20} /></button>
        </div>
        <div id="workspace-mobile-menu" className={`${mobileMenuOpen ? 'block' : 'hidden'} mt-3 lg:contents`}>
        {!cloudMode && <label className="mb-5 rounded-lg border border-white/15 bg-white/10 p-3 text-xs text-emerald-100">
          Demonstracijos rolė
          <select value={userRole} onChange={(event) => changeDemoRole(event.target.value)} className="mt-2 w-full rounded-md bg-white px-2 py-2 font-semibold text-slate-900">
            <option value="darbuotojas">Darbuotojas</option><option value="dss">DSS specialistas</option><option value="vadovas">Įmonės vadovas</option><option value="kurejas">Turinio kūrėjas</option>
          </select>
        </label>}
        {userRole === 'dss' && <label className="mb-4 text-xs text-emerald-100">{cloudMode ? 'DSS specialistas' : 'Demo DSS paskyra'}
          <select value={selectedSpecialistId} onChange={(event) => { setSelectedSpecialistId(event.target.value); const org = data.organizations.find((item) => item.dss.includes(event.target.value) || item.dssInvitations?.some((invite) => invite.specialistId === event.target.value)); if (org) setSelectedOrgId(org.id); setMobileMenuOpen(false); }} className="mt-2 w-full rounded-md bg-white px-2 py-2 font-semibold text-slate-900">{data.specialists.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
        </label>}
        {userRole !== 'kurejas' && accessibleOrganizations.length > 1 && (
          <label className="mb-4 text-xs text-emerald-100">Aktyvi įmonė
            <select value={selectedOrgId} onChange={(event) => { const orgId = event.target.value; const org = data.organizations.find((item) => item.id === orgId); setSelectedOrgId(orgId); setAapDraft(org?.aapItems ?? defaultAapItems); setInviteResourceIds(org?.resources ?? []); setSelectedEmployeeId(data.employees.find((employee) => employee.orgId === orgId)?.id ?? ''); setMobileMenuOpen(false); }} className="mt-2 w-full rounded-md bg-white px-2 py-2 font-semibold text-slate-900">
              {accessibleOrganizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
        )}
        {userRole === 'darbuotojas' && <label className="mb-4 text-xs text-emerald-100">Demo darbuotojas
          <select value={currentEmployee?.id ?? ''} onChange={(event) => { setSelectedEmployeeId(event.target.value); setMobileMenuOpen(false); }} className="mt-2 w-full rounded-md bg-white px-2 py-2 font-semibold text-slate-900">{orgEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
        </label>}
        <nav className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:block lg:space-y-1">
          {activeNavigation.map(([id, label, Icon]) => (
            <button key={id} onClick={() => { setActiveTab(id); setNotice(''); setMobileMenuOpen(false); }} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium lg:min-h-0 ${activeTab === id ? 'bg-white/15 text-white' : 'text-emerald-100/75 hover:bg-white/10 hover:text-white'}`}>
              <Icon size={17} />{label}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 pt-4 text-xs text-emerald-100/70">{roleLabels[userRole]}</div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:min-h-16 sm:px-5 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900">{activeNavigation.find(([id]) => id === activeTab)?.[1] ?? 'Skydelis'}</h1>
            {creatorReadOnlyPreview && <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"><span className="hidden sm:inline">Kūrėjo vadovo prieiga · {creatorReadOnlyPreview}</span><button type="button" className="rounded border border-amber-300 bg-white px-2 py-1 hover:bg-amber-100" onClick={onExitCreatorPreview}>Baigti darbą</button></div>}
            <span className="hidden text-sm text-slate-500 sm:inline">DSS Pro <span className="px-2 text-slate-300">/</span><span className="font-semibold text-slate-800">{activeNavigation.find(([id]) => id === activeTab)?.[1] ?? 'Skydelis'}</span></span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold sm:gap-3">
            <a href="#pagalba" title="Pagalba ir žinynas" aria-label="Pagalba ir žinynas" className="hidden size-9 place-items-center rounded-md text-slate-500 hover:bg-slate-50 hover:text-slate-700 sm:grid"><LifeBuoy size={18} /></a>
            <div className="relative">
              <button type="button" aria-label={`Pranešimai: ${notifications.length}`} aria-expanded={notificationsOpen} onClick={() => { setProfileMenuOpen(false); setNotificationsOpen((open) => !open); }} className="relative grid size-9 place-items-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">
                <Bell size={18} />
                {notifications.length > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">{notifications.length}</span>}
              </button>
              {notificationsOpen && <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h2 className="font-semibold">Pranešimai</h2><span className="text-xs text-slate-500">{notifications.length} pranešimų</span></div>
                {notifications.length ? <ul className="max-h-80 overflow-y-auto">{notifications.map((item) => <li key={item.id} className="border-b border-slate-100 last:border-0">
                  <button type="button" className="w-full px-4 py-3 text-left hover:bg-slate-50" onClick={() => {
                    setNotificationsOpen(false);
                    setNotice('');
                    if (userRole === 'darbuotojas') {
                      setActiveTab('uzduotys');
                      if (item.commissionInvitation) {
                        setCommissionInvitationTarget(item.commissionInvitation);
                        setCommissionConsentChecked(false);
                        setSignatureInk('');
                        setWorkerSignPin('');
                        setCommissionActionError('');
                        return;
                      }
                      if (item.commissionTask) {
                        setProtocolCommissionTaskTarget(item.commissionTask);
                        setSignatureInk('');
                        setWorkerSignPin('');
                        setCommissionActionError('');
                        return;
                      }
                      setTaskFilter('visos');
                      if (item.resource) openResourcePreview(item.resource);
                    } else if (userRole === 'dss') {
                      if (!currentSpecialist?.pin) {
                        setActiveTab('paskyra');
                        setNotice('Nustatykite PIN prieš pasirašydami dokumentus.');
                      } else {
                        setSelectedOrgId(item.task.orgId);
                        setActiveTab('zurnalai');
                        requestDssSign([item.task]);
                      }
                    } else if (userRole === 'vadovas' && item.employee && item.resource && item.commissionMember) {
                      requestCommissionSign(item.employee, item.resource, item.commissionMember);
                    } else if (userRole === 'vadovas' && item.commissionAcceptance) {
                      setActiveTab('imone');
                    } else if (userRole === 'vadovas' && (item.expiredResource || item.expiredMedicalCertificate || item.medicalCertificateReminder)) {
                      const employee = item.expiredResource?.employee ?? item.expiredMedicalCertificate ?? item.medicalCertificateReminder;
                      setActiveTab('skydelis');
                      window.setTimeout(() => openEmployeeDetails(employee.id), 0);
                    } else if (userRole === 'vadovas' && item.employee && item.resource) {
                      requestEmployerSign(item.employee, item.resource);
                    }
                  }}>
                    <span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.description}</span>
                  </button>
                </li>)}</ul> : <p className="px-4 py-5 text-sm text-slate-500">Naujų veiksmų nėra.</p>}
              </div>}
            </div>
            <div ref={profileMenuRef} className="relative">
              <button type="button" aria-label={`Profilis: ${displayName ?? 'Naudotojas'}`} aria-haspopup="menu" aria-expanded={profileMenuOpen} onClick={() => { setNotificationsOpen(false); setProfileMenuOpen((open) => !open); }} className="flex max-w-[55vw] items-center gap-2 rounded-full py-1 pl-1 pr-2 text-left hover:bg-slate-50 sm:pr-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-900">{(displayName ?? 'JP').split(' ').map((part) => part[0]).join('')}</span>
                <span className="hidden max-w-[40vw] truncate sm:inline">{displayName}</span>
                <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {profileMenuOpen && <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-slate-900 shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3"><p className="truncate text-sm font-semibold">{displayName}</p><p className="mt-0.5 text-xs font-normal text-slate-500">{roleLabels[userRole]}</p></div>
                <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onExit?.(); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"><LogOut size={16} />Atsijungti</button>
              </div>}
            </div>
          </div>
        </header>
        <div className="w-full max-w-none space-y-5 px-3 py-4 sm:px-4 sm:py-5 lg:space-y-6 lg:px-6 lg:py-6">
          {userRole === 'dss' && onLoadDssOrganization && (dssWorkspaceLoadState.organizationId !== selectedOrgId || dssWorkspaceLoadState.status === 'loading') && <div role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">Įkeliami pasirinktos įmonės duomenys…</div>}
          {userRole === 'dss' && onLoadDssOrganization && dssWorkspaceLoadState.organizationId === selectedOrgId && dssWorkspaceLoadState.status === 'error' && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"><span>Įmonės darbo srities įkelti nepavyko: {dssWorkspaceLoadState.error}</span><button type="button" className="rounded-md border border-rose-300 bg-white px-3 py-1.5 font-semibold hover:bg-rose-100" onClick={() => { setDssWorkspaceLoadState({ organizationId: selectedOrgId, status: 'loading', error: '' }); setDssWorkspaceLoadAttempt((attempt) => attempt + 1); }}>Bandyti dar kartą</button></div>}
          {notice && <div role="status" className="flex items-start justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 print:hidden">{notice}<button onClick={() => setNotice('')} aria-label="Uždaryti pranešimą"><X size={16} /></button></div>}
          {commissionInvitationTarget && <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="commission-invitation-title">
            <section className="my-auto max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><h2 id="commission-invitation-title" className="text-xl font-bold">Kvietimas į DSS komisiją</h2><p className="mt-1 text-sm text-slate-600">{commissionInvitationTarget.organizationName} · {commissionInvitationTarget.role}</p></div><button type="button" aria-label="Uždaryti kvietimą" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setCommissionInvitationTarget(null)}><X size={20} /></button></div>
              <p className="mt-4 text-sm text-slate-700">Įmonė kviečia jus {commissionInvitationTarget.role === 'Komisijos pirmininkas' ? 'atstovauti kaip DSS komisijos pirmininką' : 'atstovauti kaip DSS komisijos narį'}. Sutikę gausite pranešimus apie jums pasirašyti pateiktus protokolus.</p>
              <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input className="mt-0.5" type="checkbox" checked={commissionConsentChecked} onChange={(event) => setCommissionConsentChecked(event.target.checked)} /><span>Patvirtinu, kad sutinku būti paskirtas(-a) {commissionInvitationTarget.role === 'Komisijos pirmininkas' ? 'DSS komisijos pirmininku' : 'DSS komisijos nariu'}.</span></label>
              <label className="mt-4 block text-sm font-medium">Sutikimo parašas</label><SignaturePad value={signatureInk} onChange={setSignatureInk} />
              <label className="mt-4 block text-sm font-medium">Asmeninis 4 skaitmenų PIN<input className={`${inputClass} mt-1 max-w-xs`} type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} pattern="[0-9]{4}" value={workerSignPin} onChange={(event) => setWorkerSignPin(event.target.value)} required /></label>
              {commissionActionError && <p role="alert" className="mt-3 text-sm text-rose-700">{commissionActionError}</p>}
              <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" disabled={commissionActionSubmitting} onClick={() => respondToCommissionInvitation(false)}>Atsisakyti kvietimo</button><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" disabled={commissionActionSubmitting} onClick={() => setCommissionInvitationTarget(null)}>Uždaryti</button><button type="button" className={buttonClass} disabled={commissionActionSubmitting || !commissionConsentChecked || !signatureInk || !/^\d{4}$/.test(workerSignPin)} onClick={() => respondToCommissionInvitation(true)}>{commissionActionSubmitting ? 'Išsaugoma…' : 'Sutikti ir pasirašyti'} <Check size={16} /></button></div>
            </section>
          </div>}
          {protocolCommissionTaskTarget && <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="commission-protocol-title">
            <form onSubmit={signProtocolCommissionTask} className="my-auto max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><h2 id="commission-protocol-title" className="text-xl font-bold">Komisijos protokolo parašas</h2><p className="mt-1 text-sm text-slate-600">{protocolCommissionTaskTarget.resourceTitle} · protokolas Nr. {protocolCommissionTaskTarget.batchNumber}</p></div><button type="button" aria-label="Uždaryti pasirašymo langą" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setProtocolCommissionTaskTarget(null)}><X size={20} /></button></div>
              <p className="mt-3 text-sm text-slate-700">Jūsų parašas bus įrašytas vieną kartą visam protokolui jūsų, kaip {protocolCommissionTaskTarget.role.toLocaleLowerCase('lt')}, vardu.</p>
              {protocolCommissionTaskTarget.employeeNames?.length > 0 && <p className="mt-2 text-sm text-slate-600">Darbuotojai: {protocolCommissionTaskTarget.employeeNames.join(', ')}</p>}
              {(() => {
                const resource = data.resources.find((item) => item.id === protocolCommissionTaskTarget.resourceId);
                return resource && <button type="button" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 underline" onClick={() => openResourcePreview(resource, { protocolBatchId: protocolCommissionTaskTarget.batchId, commissionAssignments: protocolCommissionTaskTarget.commissionAssignments, protocolCommissionSignatures: protocolCommissionTaskTarget.protocolCommissionSignatures })}><Eye size={16} />Peržiūrėti visą protokolą</button>;
              })()}
              <label className="mt-4 block text-sm font-medium">Protokolo parašas</label><SignaturePad value={signatureInk} onChange={setSignatureInk} />
              <label className="mt-4 block text-sm font-medium">Asmeninis 4 skaitmenų PIN<input className={`${inputClass} mt-1 max-w-xs`} type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} pattern="[0-9]{4}" value={workerSignPin} onChange={(event) => setWorkerSignPin(event.target.value)} required /></label>
              {commissionActionError && <p role="alert" className="mt-3 text-sm text-rose-700">{commissionActionError}</p>}
              <div className="mt-5 flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" disabled={commissionActionSubmitting} onClick={() => setProtocolCommissionTaskTarget(null)}>Atšaukti</button><button className={buttonClass} disabled={commissionActionSubmitting || !signatureInk || !/^\d{4}$/.test(workerSignPin)}>{commissionActionSubmitting ? 'Išsaugoma…' : 'Pasirašyti protokolą'} <FileSignature size={16} /></button></div>
            </form>
          </div>}

          {activeTab === 'skydelis' && (
            <section className="mx-auto w-full max-w-[1400px] space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{userRole === 'darbuotojas' ? 'Mano saugos užduotys' : userRole === 'dss' ? 'Įmonių saugos priežiūra' : userRole === 'vadovas' ? 'Darbuotojų apžvalga' : 'Turinio ir paskyrų valdymas'}</h1><p className="mt-1 text-sm text-slate-500">{userRole === 'vadovas' ? `${currentOrg?.name ?? ''} · DSS valdymo skydelis` : `${roleLabels[userRole]} darbo vieta · ${cloudMode ? 'duomenys saugomi debesijoje' : 'vietinis demo, duomenys išsaugomi šioje naršyklėje'}`}</p></div></div>
              {userRole === 'darbuotojas' ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric accent="blue" label="Mano užduotys" value={currentEmployee?.resourceIds.length ?? 0} /><Metric accent="amber" label="Laukia mano veiksmo" value={pendingResourceIds.length} /><Metric accent="blue" label="Pradėta" value={startedCount} /><Metric accent="amber" label="Užbaigta, nepasirašyta" value={unsignedCount} /><Metric accent="green" label={pinSignedStatusLabel} value={workerSignedCount} /></div>
                : userRole === 'dss' ? <div className="grid gap-4 sm:grid-cols-3"><Metric accent="blue" label="Prižiūrimos įmonės" value={data.organizations.filter((org) => org.dss.includes(selectedSpecialistId)).length} /><Metric accent="amber" label="Laukia DSS parašo" value={dssTasks.filter((task) => task.orgId === currentOrg?.id).length} /><Metric accent="green" label="Darbuotojų parašai" value={signedCount} /></div>
                  : userRole === 'vadovas' ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric accent="blue" label="Iš viso darbuotojų" value={orgEmployees.length} /><Metric accent="green" label="Aktyvūs darbuotojai" value={orgEmployees.filter((employee) => employee.status === 'Aktyvus').length} /><Metric accent="amber" label="Laukia parašų" value={pendingCount} /><Metric accent="rose" label="Pasibaigę med. pažymėjimai" value={orgEmployees.filter((employee) => isDateExpired(employee.medicalCertificateValidUntil, validityCheckTime)).length} /></div>
                    : <div className="grid gap-4 sm:grid-cols-3"><Metric accent="blue" label="Turinio šablonai" value={data.resources.length} /><Metric accent="green" label="Įmonių paskyros" value={data.organizations.length} /><Metric accent="amber" label="Valdomos prenumeratos" value={data.subscriptions.length} /></div>}
              {userRole === 'darbuotojas' && (pendingCommissionInvitations.length > 0 || pendingCommissionTasks.length > 0 || completedCommissionTasks.length > 0) && <Panel title="DSS komisijos veiksmai">
                <div className="space-y-3">
                  {pendingCommissionInvitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div><p className="font-semibold">Kvietimas · {invitation.organizationName}</p><p className="mt-1 text-sm text-slate-600">{invitation.role === 'Komisijos pirmininkas' ? 'Kviečiama tapti komisijos pirmininku.' : 'Kviečiama tapti DSS komisijos nariu.'}</p></div>
                    <button type="button" className={buttonClass} onClick={() => { setCommissionInvitationTarget(invitation); setCommissionConsentChecked(false); setSignatureInk(''); setWorkerSignPin(''); setCommissionActionError(''); }}><FileSignature size={16} />Peržiūrėti kvietimą</button>
                  </div>)}
                  {pendingCommissionTasks.map((task) => {
                    const resource = data.resources.find((item) => item.id === task.resourceId);
                    return <div key={`${task.assignmentId}-${task.batchId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
                      <div><p className="font-semibold">{task.resourceTitle}</p><p className="mt-1 text-sm text-slate-600">{task.role} · protokolas Nr. {task.batchNumber} · {task.protocolDate || 'data nenurodyta'}</p></div>
                      <div className="flex gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => resource && openResourcePreview(resource, { protocolBatchId: task.batchId, commissionAssignments: task.commissionAssignments, protocolCommissionSignatures: task.protocolCommissionSignatures })}><Eye size={15} />Peržiūrėti protokolą</button><button type="button" className={buttonClass} onClick={() => { setProtocolCommissionTaskTarget(task); setSignatureInk(''); setWorkerSignPin(''); setCommissionActionError(''); }}><FileSignature size={15} />Pasirašyti</button></div>
                    </div>;
                  })}
                  {completedCommissionTasks.map((task) => {
                    const resource = data.resources.find((item) => item.id === task.resourceId);
                    return <div key={`${task.assignmentId}-${task.batchId}-signed`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <div><p className="font-semibold">{task.resourceTitle}</p><p className="mt-1 text-sm text-emerald-800">Protokolas Nr. {task.batchNumber} · pasirašyta kaip {task.role}</p></div>
                      {resource && <button type="button" className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-900" onClick={() => openResourcePreview(resource, { protocolBatchId: task.batchId, commissionAssignments: task.commissionAssignments, protocolCommissionSignatures: task.protocolCommissionSignatures })}><Eye size={15} />Peržiūrėti pasirašytą protokolą</button>}
                    </div>;
                  })}
                </div>
              </Panel>}
              {userRole === 'dss' && <Panel title="Prižiūrimos įmonės">
                {!data.organizations.some((org) => org.dss.includes(selectedSpecialistId)) && <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">Jūsų DSS specialisto paskyra aktyvi ir galite naudotis bendromis sistemos bei paskyros funkcijomis. Šiuo metu neturite prižiūrimų įmonių; gavę kvietimą galėsite jį priimti čia.</p>}
                <div className="grid gap-4 md:grid-cols-2">
                  {data.organizations.filter((org) => org.dss.includes(selectedSpecialistId)).map((org) => <div className="rounded-md border border-slate-200 p-4" key={org.id}><h2 className="font-semibold">{org.name}</h2><p className="mt-1 text-sm text-slate-500">Įmonės kodas: {org.companyCode}</p><p className="mt-3 text-sm">{dssWorkspaceLoadState.organizationId === org.id && dssWorkspaceLoadState.status === 'ready' ? `${data.employees.filter((employee) => employee.orgId === org.id).length} darbuotojai` : 'Duomenys įkeliami tik atidarius įmonę.'}</p><button className={`${buttonClass} mt-4`} onClick={() => { setSelectedOrgId(org.id); setActiveTab('zurnalai'); }}>Atidaryti įmonę <ArrowRight size={16} /></button></div>)}
                  {(data.dssInvitations ?? []).map((invitation) => <div className="rounded-md border border-amber-200 bg-amber-50 p-4" key={invitation.id}>
                    <h2 className="font-semibold">Kvietimas · {invitation.organization_name}</h2>
                    <p className="mt-1 text-sm text-slate-600">Įmonė kviečia jus tapti jos DSS specialistu. Prieigą gausite tik sutikę.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={buttonClass} disabled={dssInvitationActionId === invitation.id} onClick={() => respondToDssInvitation(invitation, true)}>{dssInvitationActionId === invitation.id ? 'Vykdoma…' : 'Sutikti'} <Check size={16} /></button>
                      <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50" disabled={dssInvitationActionId === invitation.id} onClick={() => respondToDssInvitation(invitation, false)}>Atsisakyti</button>
                    </div>
                  </div>)}
                  {!cloudMode && data.organizations.flatMap((org) => (org.dssInvitations ?? []).filter((invite) => invite.specialistId === selectedSpecialistId).map((invite) => <div className="rounded-md border border-amber-200 bg-amber-50 p-4" key={`${org.id}-${invite.specialistId}`}><h2 className="font-semibold">Kvietimas · {org.name}</h2><p className="mt-1 text-sm text-slate-500">Įmonės kodas: {org.companyCode}</p><button className={`${buttonClass} mt-4`} onClick={() => acceptSpecialistInvite(org.id, invite.specialistId)}>Priimti kvietimą <Check size={16} /></button></div>))}
                </div>
              </Panel>}
              {userRole === 'vadovas' && <Panel title="">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <label className="relative block w-full sm:max-w-xs"><span className="sr-only">Ieškoti darbuotojų</span><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input type="search" className={`${inputClass} pl-9`} value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setEmployeePage(1); }} placeholder="Ieškoti..." /></label>
                  <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
                    <button type="button" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={() => { setAssignmentPresetDraft({ id: '', name: '', resourceIds: [] }); document.getElementById('assignment-presets-dialog')?.showModal(); }}><Settings2 size={16} />Ruošiniai ({currentOrg?.employeeAssignmentPresets?.length ?? 0})</button>
                    <button type="button" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={() => document.getElementById('invite-employee-dialog')?.showModal()}><Plus size={16} />Pridėti darbuotoją</button>
                  </div>
                </div>
                <div className="mb-3 flex items-center justify-between gap-3 text-sm text-slate-500"><span>Rasta darbuotojų: <span className="font-semibold text-slate-800">{filteredOrgEmployees.length}</span></span></div>
                <div className="space-y-3 lg:hidden">{paginatedOrgEmployees.map((employee) => {
                  const assignedResources = (employee.resourceIds ?? []).filter((id) => currentOrg.resources.includes(id)).map((id) => data.resources.find((resource) => resource.id === id)).filter(Boolean);
                  const medicalDate = employee.medicalCertificateValidUntil;
                  const medicalDateExpired = isDateExpired(medicalDate, validityCheckTime);
                  const MedicalIcon = !medicalDate ? CircleAlert : medicalDateExpired ? CircleX : CircleCheck;
                  const needsReminder = employee.status === 'Pakviestas' || assignedResources.some((resource) => ['todo', 'started', 'unsigned', 'expired'].includes(getTaskStatus(employee, resource).key));
                  const badge = getEmployeeDashboardBadge(employee, assignedResources);
                  const BadgeIcon = badge.Icon;
                  return <article className="rounded-lg border border-slate-200 bg-white p-3" key={employee.id}>
                    <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-semibold text-slate-900">{employee.name}</h3><span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${badge.cls}`}>{badge.label}<BadgeIcon size={13} /></span></div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
                      {dashboardResourceGroups.map((group) => {
                        const summary = getDashboardGroupSummary(employee, assignedResources, group);
                        const SummaryIcon = summary?.Icon ?? CircleAlert;
                        return <div className="min-w-0" key={group.key}><p className="text-xs font-medium text-slate-500">{group.label}</p>{summary ? <div className="mt-1"><span title={summary.title} className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${summary.tone}`}><span className="truncate">{summary.label}</span><SummaryIcon size={13} className="shrink-0" /></span></div> : <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">Netaikoma<CircleAlert size={13} /></p>}</div>;
                      })}
                      <label className="col-span-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-500">Med. pažymėjimas
                        <span className="flex items-center gap-1.5"><input type="date" aria-label={`Sveikatos pažymėjimo galiojimas: ${employee.name}`} className={`w-32 rounded-md border px-1.5 py-1.5 text-xs tabular-nums outline-none focus:ring-2 focus:ring-blue-100 ${medicalDate ? medicalDateExpired ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`} value={medicalDate ?? ''} onChange={(event) => updateMedicalCertificateDate(employee.id, event.target.value)} /><MedicalIcon size={15} className={`shrink-0 ${medicalDate ? medicalDateExpired ? 'text-rose-600' : 'text-emerald-600' : 'text-slate-400'}`} /></span>
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-2"><button type="button" title={`Peržiūrėti ${employee.name}`} aria-label={`Peržiūrėti ${employee.name}`} className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50" onClick={() => openEmployeeDetails(employee.id)}><Eye size={17} /></button><button type="button" title={`Redaguoti ${employee.name}`} aria-label={`Redaguoti ${employee.name}`} className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50" onClick={() => openEmployeeEditor(employee)}><Pencil size={17} /></button>{needsReminder && <button type="button" title={employee.status === 'Pakviestas' ? `Persiųsti kvietimą ${employee.name}` : `Siųsti priminimą ${employee.name}`} aria-label={employee.status === 'Pakviestas' ? `Persiųsti kvietimą ${employee.name}` : `Siųsti priminimą ${employee.name}`} className="rounded-md border border-amber-300 p-1.5 text-amber-700 hover:bg-amber-50" onClick={() => remindEmployee(employee)}><BellRing size={17} /></button>}{hasEmployeeSignatures(employee.id) ? <button type="button" title={`Archyvuoti ${employee.name}`} aria-label={`Archyvuoti ${employee.name}`} className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700" onClick={() => archiveEmployee(employee)}><Archive size={17} /></button> : <button type="button" title={`Ištrinti ${employee.name}`} aria-label={`Ištrinti ${employee.name}`} className="rounded-md border border-rose-300 p-1.5 text-rose-700 hover:bg-rose-50" onClick={() => deleteEmployee(employee)}><Trash2 size={17} /></button>}</div>
                  </article>;
                })}</div>
                <div className="hidden w-full overflow-x-auto lg:block"><table className="w-full min-w-max text-left text-[13px]"><thead><tr className="border-y border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th rowSpan={2} className="min-w-40 px-3 py-3"><span className="pl-1">Darbuotojas</span></th>
                  <th colSpan={dashboardResourceGroups.length} className="px-2 py-2 text-center">Turinio tipai</th>
                  {renderEmployeeSortHeader('medical', <>Med. pažymėjimo<br />galiojimas</>, 'min-w-32', 'Med. pažymėjimo galiojimas', 2)}
                  {renderEmployeeSortHeader('status', 'Būsena', 'min-w-28', 'Būsena', 2)}
                  <th rowSpan={2} className="min-w-28 px-2 py-3 text-center">Veiksmai</th>
                </tr><tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  {dashboardResourceGroups.map((group) => renderEmployeeSortHeader(group.key, group.label, 'min-w-36', group.label))}
                </tr></thead>
                  <tbody className="divide-y divide-slate-100">{paginatedOrgEmployees.map((employee) => {
                    const assignedResources = (employee.resourceIds ?? []).filter((id) => currentOrg.resources.includes(id)).map((id) => data.resources.find((resource) => resource.id === id)).filter(Boolean);
                    const medicalDate = employee.medicalCertificateValidUntil;
                    const medicalDateExpired = isDateExpired(medicalDate, validityCheckTime);
                    const MedicalIcon = !medicalDate ? CircleAlert : medicalDateExpired ? CircleX : CircleCheck;
                    const needsReminder = employee.status === 'Pakviestas' || assignedResources.some((resource) => ['todo', 'started', 'unsigned', 'expired'].includes(getTaskStatus(employee, resource).key));
                    const dashboardBadge = getEmployeeDashboardBadge(employee, assignedResources);
                    return <tr className="border-b border-slate-200 last:border-0 hover:bg-slate-50/80" key={employee.id}>
                      <td className="break-words px-3 py-3 align-middle font-medium text-slate-900">{employee.name}</td>
                      {dashboardResourceGroups.map((group) => {
                        const summary = getDashboardGroupSummary(employee, assignedResources, group);
                        const SummaryIcon = summary?.Icon ?? CircleAlert;
                        return <td className="px-2 py-3 align-middle" key={group.key}>{summary ? <div className="flex justify-center"><span title={summary.title} className={`inline-flex max-w-full items-center justify-center gap-1.5 truncate rounded-full px-2 py-1 text-[13px] font-semibold ${summary.tone}`}><span className="truncate">{summary.label}</span><SummaryIcon size={14} className="shrink-0" /></span></div> : <span title="Šio tipo dokumentas darbuotojui nepriskirtas" className="flex items-center justify-center gap-1 text-[13px] text-slate-400">Netaikoma<CircleAlert size={14} /></span>}</td>;
                      })}
                      <td className="px-1 py-2 align-middle"><div className="flex items-center justify-center gap-1"><input type="date" aria-label={`Sveikatos pažymėjimo galiojimas: ${employee.name}`} title="Įrašykite arba pakeiskite galiojimo datą" className={`w-28 min-w-0 rounded-md border px-1 py-1.5 text-xs tabular-nums outline-none focus:ring-2 focus:ring-blue-100 ${medicalDate ? medicalDateExpired ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`} value={medicalDate ?? ''} onChange={(event) => updateMedicalCertificateDate(employee.id, event.target.value)} /><MedicalIcon size={13} className={`shrink-0 ${medicalDate ? medicalDateExpired ? 'text-rose-600' : 'text-emerald-600' : 'text-slate-400'}`} title={!medicalDate ? 'Data nenurodyta' : medicalDateExpired ? 'Pažymėjimas nebegalioja' : 'Pažymėjimas galioja'} /></div></td>
                      <td className="px-2 py-3 align-middle">{(() => {
                        const badge = dashboardBadge;
                        const BadgeIcon = badge.Icon;
                        return <span title="Bendra darbuotojo užduočių būsena" className={`inline-flex w-full items-center justify-center gap-1 rounded-md px-1 py-1 text-[13px] font-semibold ${badge.cls}`}><span>{badge.label}</span><BadgeIcon size={13} /></span>;
                      })()}</td>
                      <td className="px-1 py-2 align-middle"><div className="flex justify-center gap-0.5"><button type="button" title={`Peržiūrėti ${employee.name}`} aria-label={`Peržiūrėti ${employee.name}`} className="rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-slate-50" onClick={() => openEmployeeDetails(employee.id)}><Eye size={16} /></button><button type="button" title={`Redaguoti ${employee.name}`} aria-label={`Redaguoti ${employee.name}`} className="rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-slate-50" onClick={() => openEmployeeEditor(employee)}><Pencil size={16} /></button>{needsReminder && <button type="button" title={employee.status === 'Pakviestas' ? `Persiųsti kvietimą ${employee.name}` : `Siųsti priminimą ${employee.name}`} aria-label={employee.status === 'Pakviestas' ? `Persiųsti kvietimą ${employee.name}` : `Siųsti priminimą ${employee.name}`} className="rounded-md border border-amber-300 p-1 text-amber-700 hover:bg-amber-50" onClick={() => remindEmployee(employee)}><BellRing size={16} /></button>}{hasEmployeeSignatures(employee.id) ? <button type="button" title={`Archyvuoti ${employee.name}`} aria-label={`Archyvuoti ${employee.name}`} className="rounded-md border border-slate-300 p-1 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700" onClick={() => archiveEmployee(employee)}><Archive size={16} /></button> : <button type="button" title={`Ištrinti ${employee.name}`} aria-label={`Ištrinti ${employee.name}`} className="rounded-md border border-rose-300 p-1 text-rose-700 hover:bg-rose-50" onClick={() => deleteEmployee(employee)}><Trash2 size={16} /></button>}</div></td>
                    </tr>;
                  })}</tbody></table></div>
                {filteredOrgEmployees.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Darbuotojų pagal pasirinktus filtrus nerasta.</p>}
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">Rodoma {filteredOrgEmployees.length ? (currentEmployeePage - 1) * employeePageSize + 1 : 0}–{Math.min(currentEmployeePage * employeePageSize, filteredOrgEmployees.length)} iš {filteredOrgEmployees.length} darbuotojų</p>
                  <div className="flex items-center justify-center gap-2">
                    <button type="button" aria-label="Pirmas puslapis" title="Pirmas puslapis" className="grid size-8 place-items-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40" disabled={currentEmployeePage <= 1} onClick={() => setEmployeePage(1)}><ChevronsLeft size={15} /></button>
                    <button type="button" aria-label="Ankstesnis puslapis" title="Ankstesnis puslapis" className="grid size-8 place-items-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={currentEmployeePage <= 1} onClick={() => setEmployeePage((page) => Math.max(1, page - 1))}><ChevronLeft size={15} /></button>
                    <span className="grid size-8 place-items-center rounded border border-emerald-300 bg-emerald-50 text-sm font-medium text-emerald-800">{currentEmployeePage}</span>
                    <button type="button" aria-label="Kitas puslapis" title="Kitas puslapis" className="grid size-8 place-items-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={currentEmployeePage >= employeePageCount} onClick={() => setEmployeePage((page) => Math.min(employeePageCount, page + 1))}><ChevronRight size={15} /></button>
                    <button type="button" aria-label="Paskutinis puslapis" title="Paskutinis puslapis" className="grid size-8 place-items-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40" disabled={currentEmployeePage >= employeePageCount} onClick={() => setEmployeePage(employeePageCount)}><ChevronsRight size={15} /></button>
                  </div>
                </div>
              </Panel>}
              {userRole === 'vadovas' && <dialog id="invite-employee-dialog" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/60">
                <form onSubmit={inviteEmployee} className="space-y-5">
                  <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Pakviesti darbuotoją</h2><p className="mt-1 text-sm text-slate-500">Įveskite darbuotojo duomenis ir parinkite dokumentus.</p></div><button type="button" aria-label="Uždaryti kvietimo langą" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => document.getElementById('invite-employee-dialog')?.close()}><X size={20} /></button></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium">Vardas<input className={`${inputClass} mt-1`} value={employeeForm.firstName} onChange={(event) => setEmployeeForm({ ...employeeForm, firstName: event.target.value })} required /></label>
                    <label className="text-sm font-medium">Pavardė<input className={`${inputClass} mt-1`} value={employeeForm.lastName} onChange={(event) => setEmployeeForm({ ...employeeForm, lastName: event.target.value })} required /></label>
                    <label className="text-sm font-medium">El. paštas<input className={`${inputClass} mt-1 ${employeeEmailError ? 'border-rose-400' : ''}`} type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} aria-invalid={Boolean(employeeEmailError)} aria-describedby={employeeEmailError ? 'employee-email-error' : undefined} required />{employeeEmailError && <span id="employee-email-error" role="alert" className="mt-1 block text-xs font-medium text-rose-700">{employeeEmailError}</span>}</label>
                    <label className="text-sm font-medium">Darbo sutarties Nr.<input className={`${inputClass} mt-1 ${employeeContractNumberError ? 'border-rose-400' : ''}`} value={employeeForm.contractNumber} onChange={(event) => setEmployeeForm({ ...employeeForm, contractNumber: event.target.value })} aria-invalid={Boolean(employeeContractNumberError)} aria-describedby={employeeContractNumberError ? 'employee-contract-number-error' : undefined} required />{employeeContractNumberError && <span id="employee-contract-number-error" role="alert" className="mt-1 block text-xs font-medium text-rose-700">{employeeContractNumberError}</span>}</label>
                    <label className="text-sm font-medium">Pareigos<input className={`${inputClass} mt-1`} value={employeeForm.position} onChange={(event) => setEmployeeForm({ ...employeeForm, position: event.target.value })} placeholder="Darbuotojas" /></label>
                    <label className="text-sm font-medium">Med. pažymėjimas · galioja iki<input className={`${inputClass} mt-1`} type="date" value={employeeForm.medicalCertificateValidUntil} onChange={(event) => setEmployeeForm({ ...employeeForm, medicalCertificateValidUntil: event.target.value })} /></label>
                  </div>
                  <label className="block text-sm font-medium">Darbuotojo ruošinys<select className={`${inputClass} mt-1`} value={selectedAssignmentPresetId} onChange={(event) => { const presetId = event.target.value; const preset = (currentOrg.employeeAssignmentPresets ?? []).find((item) => item.id === presetId); setSelectedAssignmentPresetId(presetId); if (preset) setInviteResourceIds(preset.resourceIds.filter((id) => currentOrg.resources.includes(id))); }}><option value="">Pasirinkti ruošinį</option>{(currentOrg.employeeAssignmentPresets ?? []).map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.resourceIds.length} dokumentai</option>)}</select>{!(currentOrg.employeeAssignmentPresets ?? []).length && <span className="mt-1 block text-xs font-normal text-slate-500">Ruošinius susikurkite darbuotojų sąrašo skiltyje „Ruošiniai“.</span>}</label>
                  <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Priskiriami dokumentai</legend><div className="grid gap-2 sm:grid-cols-2">{data.resources.filter((resource) => currentOrg.resources.includes(resource.id)).map((resource) => <label className="flex items-center gap-2 text-sm" key={resource.id}><input type="checkbox" checked={inviteResourceIds.includes(resource.id)} onChange={(event) => { setSelectedAssignmentPresetId(''); setInviteResourceIds((current) => event.target.checked ? [...new Set([...current, resource.id])] : current.filter((id) => id !== resource.id)); }} />{resource.title}</label>)}{!currentOrg.resources.length && <p className="text-sm text-slate-500">Pirmiausia pridėkite šablonų į įmonės biblioteką.</p>}</div></fieldset>
                  <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => document.getElementById('invite-employee-dialog')?.close()}>Atšaukti</button><button className={buttonClass} disabled={inviteSubmitting}><Plus size={16} />{inviteSubmitting ? 'Siunčiamas kvietimas…' : 'Pakviesti'}</button></div>
                </form>
              </dialog>}
              {userRole === 'vadovas' && <dialog id="assignment-presets-dialog" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/60">
                <div className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Darbuotojų priskyrimų ruošiniai</h2><p className="mt-1 text-sm text-slate-500">Išsaugokite dažnai naudojamus kursų ir dokumentų rinkinius šiai įmonei.</p></div><button type="button" aria-label="Uždaryti ruošinių langą" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => { setAssignmentPresetDraft({ id: '', name: '', resourceIds: [] }); document.getElementById('assignment-presets-dialog')?.close(); }}><X size={20} /></button></div>
                  <form onSubmit={saveAssignmentPreset} className="space-y-4 rounded-lg border border-slate-200 p-4"><label className="block text-sm font-medium">Ruošinio pavadinimas<input className={`${inputClass} mt-1`} value={assignmentPresetDraft.name} onChange={(event) => setAssignmentPresetDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Pvz., Sandėlio darbuotojas" required /></label><fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Priskiriami kursai ir dokumentai</legend><div className="grid gap-2 sm:grid-cols-2">{data.resources.filter((resource) => currentOrg?.resources.includes(resource.id)).map((resource) => <label className="flex items-start gap-2 text-sm" key={resource.id}><input type="checkbox" checked={assignmentPresetDraft.resourceIds.includes(resource.id)} onChange={(event) => setAssignmentPresetDraft((current) => ({ ...current, resourceIds: event.target.checked ? [...new Set([...current.resourceIds, resource.id])] : current.resourceIds.filter((id) => id !== resource.id) }))} /><span>{resource.title}<small className="block text-slate-500">{resource.type}</small></span></label>)}</div>{!currentOrg?.resources.length && <p className="text-sm text-slate-500">Pirmiausia pridėkite šablonų į įmonės biblioteką.</p>}</fieldset><div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className="text-sm font-semibold text-slate-600 hover:text-slate-900" onClick={() => setAssignmentPresetDraft({ id: '', name: '', resourceIds: [] })}>Išvalyti formą</button><button type="submit" className={buttonClass} disabled={!assignmentPresetDraft.name.trim() || !assignmentPresetDraft.resourceIds.length}><Check size={16} />{assignmentPresetDraft.id ? 'Išsaugoti pakeitimus' : 'Išsaugoti ruošinį'}</button></div></form>
                  <div><h3 className="mb-2 font-semibold">Išsaugoti ruošiniai</h3>{(currentOrg?.employeeAssignmentPresets ?? []).length ? <div className="divide-y divide-slate-100">{currentOrg.employeeAssignmentPresets.map((preset) => <div key={preset.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-40 flex-1"><p className="font-semibold">{preset.name}</p><p className="mt-0.5 text-sm text-slate-500">{preset.resourceIds.map((id) => data.resources.find((resource) => resource.id === id)?.title).filter(Boolean).join(' · ') || 'Dokumentų nėra'}</p></div><div className="flex gap-2"><button type="button" title={`Redaguoti ruošinį ${preset.name}`} aria-label={`Redaguoti ruošinį ${preset.name}`} className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50" onClick={() => setAssignmentPresetDraft({ ...preset, resourceIds: [...preset.resourceIds] })}><Pencil size={16} /></button><button type="button" title={`Pašalinti ruošinį ${preset.name}`} aria-label={`Pašalinti ruošinį ${preset.name}`} className="rounded-md border border-rose-300 p-2 text-rose-700 hover:bg-rose-50" onClick={() => deleteAssignmentPreset(preset)}><Trash2 size={16} /></button></div></div>)}</div> : <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">Ruošinių dar nėra. Pasirinkite dokumentus ir išsaugokite pirmą ruošinį.</p>}</div>
                </div>
              </dialog>}
              {userRole === 'vadovas' && <dialog id="employee-details-dialog" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/60">
                {employeeDetails && <div className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{employeeDetails.name}</h2><p className="mt-1 text-sm text-slate-500">Darbuotojo informacija ir dokumentų būklė</p></div><button type="button" aria-label="Uždaryti darbuotojo informaciją" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => { document.getElementById('employee-details-dialog')?.close(); setEmployeeDetailsId(null); }}><X size={20} /></button></div>
                  <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">El. paštas</dt><dd className="font-semibold">{employeeDetails.email}</dd></div><div><dt className="text-slate-500">Darbo sutarties Nr.</dt><dd className="font-semibold">{employeeDetails.contractNumber || 'Nenurodytas'}</dd></div><div><dt className="text-slate-500">Pareigos</dt><dd className="font-semibold">{employeeDetails.position || 'Darbuotojas'}</dd></div><div><dt className="text-slate-500">Paskyros būsena</dt><dd className="font-semibold">{employeeDetails.status}</dd></div></dl>
                  {employeeDetails.resourceIds?.includes('res-aap') && <Panel title="AAP išdavimų istorija">
                    <div className="mb-3 flex justify-end"><button type="button" className={buttonClass} onClick={() => openAapIssueForm(employeeDetails)}><Plus size={15} />Registruoti naują išdavimą</button></div>
                    {(data.aapIssuances ?? []).filter((issuance) => issuance.employeeId === employeeDetails.id).length
                      ? <div className="space-y-3">{(data.aapIssuances ?? []).filter((issuance) => issuance.employeeId === employeeDetails.id).slice().sort((left, right) => right.issuedAt.localeCompare(left.issuedAt)).map((issuance) => <div className="rounded-md border border-slate-200 p-3" key={issuance.id}>
                        <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{formatProtocolDate(issuance.issuedAt)}</strong><span className={issuance.status === 'signed' ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-800'}>{issuance.status === 'signed' ? 'Gavimas patvirtintas' : 'Laukia darbuotojo parašo'}</span></div>
                        <ul className="mt-2 list-inside list-disc text-sm text-slate-700">{issuance.items.map((item) => <li key={item.id}>{item.name} · {item.quantity} {item.unit}{item.reason ? ` · ${item.reason}` : ''}</li>)}</ul>
                        <p className="mt-2 text-xs text-slate-500">Išdavė: {issuance.issuedBy}{issuance.signedAt ? ` · Pasirašė ${issuance.signer} ${new Date(issuance.signedAt).toLocaleString('lt-LT')} · PIN · IP ${issuance.ip ?? 'Nenurodytas'}` : ''}</p>
                        <SignatureImagePreview signature={issuance} />
                        {issuance.status === 'signed' && <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline" onClick={() => downloadAapIssuance(issuance)}><Download size={15} />PDF patvirtinimas</button>}
                      </div>)}</div>
                      : <p className="text-sm text-slate-500">AAP išdavimų įrašų dar nėra.</p>}
                  </Panel>}
                  <div><h3 className="mb-2 font-semibold">Priskirti dokumentai ir parašai</h3>{(employeeDetails.resourceIds ?? []).length ? <div className="space-y-2">{employeeDetails.resourceIds.map((resourceId) => {
                    const resource = data.resources.find((item) => item.id === resourceId);
                    if (!resource) return null;
                    const status = getTaskStatus(employeeDetails, resource);
                    const signatures = data.signatures.filter((signature) => signature.employeeId === employeeDetails.id && signature.resourceId === resourceId).sort((left, right) => new Date(left.signedAt) - new Date(right.signedAt));
                    return <div className="rounded-md border border-slate-200 p-3" key={resourceId}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{resource.title}</span><WorkflowBadge status={status} /></div><RequiredSignerList employee={employeeDetails} resource={resource} org={currentOrg} signatures={data.signatures} now={validityCheckTime} specialists={data.specialists} />{signatures.length ? <div className="mt-2 space-y-2">{signatures.map((signature) => <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500" key={signature.id}><SignatureImagePreview signature={signature} /><span>{signature.signer} · {signature.role} · {new Date(signature.signedAt).toLocaleString('lt-LT')} · IP {signature.ip ?? 'Nenurodytas'}</span></div>)}</div> : <p className="mt-2 text-xs text-rose-700">Parašų dar nėra</p>}</div>;
                  })}</div> : <p className="text-sm text-slate-500">Darbuotojui dokumentai nepriskirti.</p>}</div>
                </div>}
              </dialog>}
              {userRole === 'vadovas' && <dialog id="employee-edit-dialog" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/60">
                {employeeBeingEdited && <div className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Priskyrimai · {employeeBeingEdited.name}</h2><p className="mt-1 text-sm text-slate-500">Redaguokite darbuotojo pareigas, dokumentus ir pasirašančiuosius.</p></div><button type="button" aria-label="Uždaryti priskyrimų redagavimą" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={closeEmployeeEditor}><X size={20} /></button></div>
                  <label className="block text-sm font-medium">Darbuotojo pareigos<input className={`${inputClass} mt-1`} value={employeePositionDraft} onChange={(event) => setEmployeePositionDraft(event.target.value)} placeholder="Darbuotojas" /></label>
                  <div className="space-y-3">{data.resources.filter((resource) => currentOrg.resources.includes(resource.id)).map((resource) => {
                    const isAssigned = employeeResourceDraft.includes(resource.id);
                    const selectedRoles = employeeSignerDraft[resource.id] ?? getRequiredSigners(resource, currentOrg, employeeBeingEdited);
                    return <div className="rounded-md border border-slate-200 p-3" key={resource.id}>
                      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={isAssigned} onChange={(event) => {
                        setEmployeeResourceDraft((current) => event.target.checked ? [...new Set([...current, resource.id])] : current.filter((id) => id !== resource.id));
                        if (event.target.checked) setEmployeeSignerDraft((current) => ({ ...current, [resource.id]: current[resource.id] ?? getRequiredSigners(resource, currentOrg, employeeBeingEdited) }));
                      }} /><span className="font-semibold">{resource.title}<small className="block font-normal text-slate-500">{resource.type}</small></span></label>
                      {isAssigned && <fieldset className="mt-3 border-t border-slate-100 pt-3"><legend className="mb-2 text-xs font-semibold text-slate-500">Kas turi pasirašyti</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{signerRoleOptions.map(({ value, label }) => <label key={value} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={selectedRoles.includes(value)} disabled={value === 'Darbuotojas'} onChange={(event) => setEmployeeSignerDraft((current) => {
                        const roles = current[resource.id] ?? selectedRoles;
                        return { ...current, [resource.id]: event.target.checked ? [...new Set([...roles, value])] : roles.filter((role) => role !== value) };
                      })} />{label}</label>)}</div></fieldset>}
                    </div>;
                  })}</div>
                  <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={closeEmployeeEditor} disabled={employeeAssignmentSaving}>Atšaukti</button><button type="button" className={buttonClass} onClick={saveEmployeeAssignments} disabled={employeeAssignmentSaving}>{employeeAssignmentSaving ? 'Išsaugoma…' : 'Išsaugoti priskyrimus'}</button></div>
                </div>}
              </dialog>}
            </section>
          )}

          {activeTab === 'imone' && userRole === 'vadovas' && <section className="space-y-5">
            <PageTitle title="Įmonės nustatymai" subtitle="Vadovas, DSS specialistai ir darbuotojų saugos komisija." />
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Įmonės informacija"><p className="font-semibold">{currentOrg?.name}</p><p className="mt-1 text-sm text-slate-500">Įmonės kodas: {currentOrg?.companyCode}</p><p className="mt-1 text-sm text-slate-500">Vadovas: {currentOrg?.manager}</p></Panel>
              <Panel title="DSS specialistai">
                {cloudMode && <div className="mb-3 flex justify-end"><button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={dssRefreshSubmitting} onClick={refreshDssAssignments}>{dssRefreshSubmitting ? 'Atnaujinama…' : 'Atnaujinti sąrašą'}</button></div>}
                <div className="space-y-2">{currentOrg?.dss.map((id) => data.specialists.find((person) => person.id === id)).filter(Boolean).map((person) => <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm" key={person.id}><span>{person.name}<small className="block text-slate-500">{person.email}</small></span>{cloudMode && <button type="button" className="shrink-0 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50" disabled={dssRevokeSubmittingId === person.id} onClick={() => revokeDssSpecialist(person)}>{dssRevokeSubmittingId === person.id ? 'Šalinama…' : 'Pašalinti'}</button>}</div>)}</div>
                {(data.dssInvitations ?? []).filter((invitation) => invitation.organization_id === currentOrg?.id).map((invitation) => <div key={invitation.id} className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><span>{invitation.invited_name || invitation.invited_email}</span><small className="block text-amber-800">Kvietimas išsiųstas · laukia specialisto sutikimo</small><small className="block text-slate-600">{invitation.invited_email}</small></div>)}
                {!cloudMode && (currentOrg?.dssInvitations ?? []).map((invite) => <div key={invite.specialistId} className="mt-2 rounded-md bg-amber-50 p-3 text-sm">{data.specialists.find((person) => person.id === invite.specialistId)?.name}<small className="block text-amber-800">Kvietimas paruoštas · laukia patvirtinimo</small></div>)}
                <label className="mt-4 block text-sm font-semibold">Rasti registruotą DSS specialistą
                  <div className="relative mt-2"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} value={specialistQuery} onChange={(event) => setSpecialistQuery(event.target.value)} placeholder="Vardas, pavardė arba el. paštas" /></div>
                </label>
                <p className="mt-2 text-xs text-slate-500">Patikrinkite el. paštą. Kvietimas nesuteikia prieigos iš karto — specialistas turi jį priimti prisijungęs. Pašalinant specialistą bus parodytas patvirtinimo klausimas; ankstesni jo parašai liks išsaugoti.</p>
                {cloudMode && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(specialistQuery.trim()) && <button type="button" className={`${buttonClass} mt-3`} onClick={() => inviteSpecialist({ email: specialistQuery.trim() })}><UserPlus size={16} />Kviesti {specialistQuery.trim()}</button>}
                {filteredSpecialists.map((person) => <div key={person.id} className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{person.name}<small className="block text-slate-500">{person.email} · {person.status}</small></span><button className={buttonClass} onClick={() => inviteSpecialist(person)}>Kviesti</button></div>)}
              </Panel>
              <Panel title="DSS komisija"><p className="mb-3 text-sm text-slate-500">Pasirinkite įmonės darbuotoją ir paskirkite jį komisijos nariu arba pirmininku. Darbuotojas patvirtina kvietimą savo paskyroje, parašu ir asmeniniu PIN kodu.</p>{commissionSigningTarget?.orgId === currentOrg?.id && <SignaturePad value={signatureInk} onChange={setSignatureInk} />}<CommissionEditor org={currentOrg} employees={orgEmployees} assignments={currentCommissionAssignments} onInvite={inviteEmployeeToCommission} onRevoke={revokeCommissionAssignment} cloudMode={cloudMode} commissionPinStatus={commissionPinStatus.organizationId === currentOrg?.id ? commissionPinStatus.members : {}} onSetPin={saveCommissionPin} signingTarget={commissionSigningTarget} signPin={commissionSignPin} setSignPin={setCommissionSignPin} signError={commissionSignError} onSign={confirmCommissionSign} onCancel={() => { setCommissionSigningTarget(null); setSignatureInk(''); }} /></Panel>
              <Panel title="Vadovo parašo PIN">{cloudMode ? <><p className="mb-3 text-sm text-slate-500">PIN nustatytas jūsų paskyros užbaigimo metu ir tikrinamas Supabase. Keitimui būtinas dabartinis PIN.</p><form onSubmit={changeCloudManagerPin} className="grid max-w-xl gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Dabartinis PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} pattern="[0-9]{4}" value={managerCurrentPin} onChange={(event) => setManagerCurrentPin(event.target.value)} required /></label><label className="text-sm font-medium">Naujas PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={managerPinDraft} onChange={(event) => setManagerPinDraft(event.target.value)} required /></label><label className="text-sm font-medium">Pakartokite naują PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} pattern="[0-9]{4}" value={managerPinConfirm} onChange={(event) => setManagerPinConfirm(event.target.value)} required /></label><button className={`${buttonClass} sm:col-span-2`}><LockKeyhole size={16} />Pakeisti pasirašymo PIN</button></form></> : <><p className="mb-3 text-sm text-slate-500">PIN naudojamas darbdavio parašui AAP dokumentuose.</p><form onSubmit={saveManagerPin} className="grid max-w-xl gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Naujas 4 skaitmenų PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={managerPinDraft} onChange={(event) => setManagerPinDraft(event.target.value)} required /></label><label className="text-sm font-medium">Pakartokite PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={managerPinConfirm} onChange={(event) => setManagerPinConfirm(event.target.value)} required /></label><button className={`${buttonClass} sm:col-span-2`}><LockKeyhole size={16} />Nustatyti vadovo PIN</button></form></>}</Panel>
              <Panel title="Prenumerata"><SubscriptionCard subscription={data.subscriptions.find((item) => item.orgId === currentOrg?.id)} onAction={updateSubscription} /></Panel>
            </div>
          </section>}

          {activeTab === 'komanda' && userRole === 'vadovas' && <section className="space-y-5">
            <PageTitle title="Darbuotojai" subtitle="Priskirti darbai, jų atlikimas ir parašai vienoje vietoje." />
            <div className="flex justify-end"><button type="button" className={buttonClass} onClick={() => document.getElementById('invite-employee-dialog')?.showModal()}><Plus size={16} />Pakviesti darbuotoją</button></div>
            <dialog id="invite-employee-dialog" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/60">
              <form onSubmit={inviteEmployee} className="space-y-5">
                <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Pakviesti darbuotoją</h2><p className="mt-1 text-sm text-slate-500">Įveskite darbuotojo duomenis ir parinkite dokumentus.</p></div><button type="button" aria-label="Uždaryti kvietimo langą" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => document.getElementById('invite-employee-dialog')?.close()}><X size={20} /></button></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">Vardas<input className={`${inputClass} mt-1`} value={employeeForm.firstName} onChange={(event) => setEmployeeForm({ ...employeeForm, firstName: event.target.value })} required /></label>
                  <label className="text-sm font-medium">Pavardė<input className={`${inputClass} mt-1`} value={employeeForm.lastName} onChange={(event) => setEmployeeForm({ ...employeeForm, lastName: event.target.value })} required /></label>
                  <label className="text-sm font-medium">El. paštas<input className={`${inputClass} mt-1 ${employeeEmailError ? 'border-rose-400' : ''}`} type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} aria-invalid={Boolean(employeeEmailError)} aria-describedby={employeeEmailError ? 'employee-email-error' : undefined} required />{employeeEmailError && <span id="employee-email-error" role="alert" className="mt-1 block text-xs font-medium text-rose-700">{employeeEmailError}</span>}</label>
                  <label className="text-sm font-medium">Darbo sutarties Nr.<input className={`${inputClass} mt-1 ${employeeContractNumberError ? 'border-rose-400' : ''}`} value={employeeForm.contractNumber} onChange={(event) => setEmployeeForm({ ...employeeForm, contractNumber: event.target.value })} aria-invalid={Boolean(employeeContractNumberError)} aria-describedby={employeeContractNumberError ? 'employee-contract-number-error' : undefined} required />{employeeContractNumberError && <span id="employee-contract-number-error" role="alert" className="mt-1 block text-xs font-medium text-rose-700">{employeeContractNumberError}</span>}</label>
                  <label className="text-sm font-medium">Pareigos<input className={`${inputClass} mt-1`} value={employeeForm.position} onChange={(event) => setEmployeeForm({ ...employeeForm, position: event.target.value })} placeholder="Darbuotojas" /></label>
                  <label className="text-sm font-medium">Med. pažymėjimas · galioja iki<input className={`${inputClass} mt-1`} type="date" value={employeeForm.medicalCertificateValidUntil} onChange={(event) => setEmployeeForm({ ...employeeForm, medicalCertificateValidUntil: event.target.value })} /></label>
                </div>
                <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Priskiriami dokumentai</legend><div className="grid gap-2 sm:grid-cols-2">{data.resources.filter((resource) => currentOrg.resources.includes(resource.id)).map((resource) => <label className="flex items-center gap-2 text-sm" key={resource.id}><input type="checkbox" checked={inviteResourceIds.includes(resource.id)} onChange={(event) => setInviteResourceIds((current) => event.target.checked ? [...new Set([...current, resource.id])] : current.filter((id) => id !== resource.id))} />{resource.title}</label>)}{!currentOrg.resources.length && <p className="text-sm text-slate-500">Pirmiausia pridėkite šablonų į įmonės biblioteką.</p>}</div></fieldset>
                <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => document.getElementById('invite-employee-dialog')?.close()}>Atšaukti</button><button className={buttonClass} disabled={inviteSubmitting}><Plus size={16} />{inviteSubmitting ? 'Siunčiamas kvietimas…' : 'Pakviesti'}</button></div>
              </form>
            </dialog>
            <dialog id="employee-details-dialog" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/60">
              {employeeDetails && <div className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{employeeDetails.name}</h2><p className="mt-1 text-sm text-slate-500">Darbuotojo informacija ir dokumentų būklė</p></div><button type="button" aria-label="Uždaryti darbuotojo informaciją" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => { document.getElementById('employee-details-dialog')?.close(); setEmployeeDetailsId(null); }}><X size={20} /></button></div>
                <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">El. paštas</dt><dd className="font-semibold">{employeeDetails.email}</dd></div><div><dt className="text-slate-500">Darbo sutarties Nr.</dt><dd className="font-semibold">{employeeDetails.contractNumber || 'Nenurodytas'}</dd></div><div><dt className="text-slate-500">Pareigos</dt><dd className="font-semibold">{employeeDetails.position || 'Darbuotojas'}</dd></div><div><dt className="text-slate-500">Paskyros būsena</dt><dd className="font-semibold">{employeeDetails.status}</dd></div></dl>
                <div><h3 className="mb-2 font-semibold">Priskirti dokumentai ir parašai</h3>{(employeeDetails.resourceIds ?? []).length ? <div className="space-y-2">{employeeDetails.resourceIds.map((resourceId) => {
                  const resource = data.resources.find((item) => item.id === resourceId);
                  if (!resource) return null;
                  const status = getTaskStatus(employeeDetails, resource);
                  const signatures = data.signatures.filter((signature) => signature.employeeId === employeeDetails.id && signature.resourceId === resourceId).sort((left, right) => new Date(left.signedAt) - new Date(right.signedAt));
                  return <div className="rounded-md border border-slate-200 p-3" key={resourceId}><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{resource.title}</span><WorkflowBadge status={status} /></div><RequiredSignerList employee={employeeDetails} resource={resource} org={currentOrg} signatures={data.signatures} now={validityCheckTime} specialists={data.specialists} />{signatures.length ? <div className="mt-2 space-y-1">{signatures.map((signature) => <p className="text-xs text-slate-500" key={signature.id}>{signature.signer} · {signature.role} · {new Date(signature.signedAt).toLocaleString('lt-LT')}</p>)}</div> : <p className="mt-2 text-xs text-rose-700">Parašų dar nėra</p>}</div>;
                })}</div> : <p className="text-sm text-slate-500">Darbuotojui dokumentai nepriskirti.</p>}</div>
              </div>}
            </dialog>
            <dialog id="employee-edit-dialog" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/60">
              {employeeBeingEdited && <div className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Priskyrimai · {employeeBeingEdited.name}</h2><p className="mt-1 text-sm text-slate-500">Redaguokite darbuotojo pareigas, dokumentus ir pasirašančiuosius.</p></div><button type="button" aria-label="Uždaryti priskyrimų redagavimą" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={closeEmployeeEditor}><X size={20} /></button></div>
                <label className="block text-sm font-medium">Darbuotojo pareigos<input className={`${inputClass} mt-1`} value={employeePositionDraft} onChange={(event) => setEmployeePositionDraft(event.target.value)} placeholder="Darbuotojas" /></label>
                <div className="space-y-3">{data.resources.filter((resource) => currentOrg.resources.includes(resource.id)).map((resource) => {
                  const isAssigned = employeeResourceDraft.includes(resource.id);
                  const selectedRoles = employeeSignerDraft[resource.id] ?? getRequiredSigners(resource, currentOrg, employeeBeingEdited);
                  return <div className="rounded-md border border-slate-200 p-3" key={resource.id}>
                    <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={isAssigned} onChange={(event) => {
                      setEmployeeResourceDraft((current) => event.target.checked ? [...new Set([...current, resource.id])] : current.filter((id) => id !== resource.id));
                      if (event.target.checked) setEmployeeSignerDraft((current) => ({ ...current, [resource.id]: current[resource.id] ?? getRequiredSigners(resource, currentOrg, employeeBeingEdited) }));
                    }} /><span className="font-semibold">{resource.title}<small className="block font-normal text-slate-500">{resource.type}</small></span></label>
                    {isAssigned && <fieldset className="mt-3 border-t border-slate-100 pt-3"><legend className="mb-2 text-xs font-semibold text-slate-500">Kas turi pasirašyti</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{signerRoleOptions.map(({ value, label }) => <label key={value} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={selectedRoles.includes(value)} disabled={value === 'Darbuotojas'} onChange={(event) => setEmployeeSignerDraft((current) => {
                      const roles = current[resource.id] ?? selectedRoles;
                      return { ...current, [resource.id]: event.target.checked ? [...new Set([...roles, value])] : roles.filter((role) => role !== value) };
                    })} />{label}</label>)}</div></fieldset>}
                  </div>;
                })}</div>
                <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={closeEmployeeEditor}>Atšaukti</button><button type="button" className={buttonClass} onClick={saveEmployeeAssignments}>Išsaugoti priskyrimus</button></div>
              </div>}
            </dialog>
          </section>}

          {activeTab === 'biblioteka' && userRole === 'vadovas' && <section className="space-y-5"><PageTitle title="Įmonės biblioteka" subtitle="Pasirinkite šablonus, kurie reikalingi šiai įmonei. Darbuotojams priskirkite juos skiltyje Darbuotojai." />
            {currentOrg?.resources.includes('res-aap') && <Panel title="AAP išdavimo kortelės pozicijos"><form onSubmit={saveAapItems} className="space-y-4"><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-2 py-2">Priemonė</th><th className="px-2 py-2">Pagrindas išduoti</th><th className="px-2 py-2">Kiekis</th><th className="px-2 py-2">Mato vnt.</th><th className="px-2 py-2">Tinkamumo terminas</th><th className="px-2 py-2">Kaina / vnt., Eur</th><th className="px-2 py-2">Suma, Eur</th><th className="px-2 py-2"><span className="sr-only">Šalinti</span></th></tr></thead><tbody>{aapDraft.map((item) => <tr className="border-b border-slate-100" key={item.id}><td className="p-2"><input className={inputClass} value={item.name} onChange={(event) => updateAapItem(item.id, 'name', event.target.value)} required /></td><td className="p-2"><input className={inputClass} value={item.reason} onChange={(event) => updateAapItem(item.id, 'reason', event.target.value)} placeholder="Darbo pobūdis" /></td><td className="p-2"><input className={inputClass} type="number" min="0" step="1" value={item.quantity} onChange={(event) => updateAapItem(item.id, 'quantity', event.target.value)} /></td><td className="p-2"><input className={inputClass} value={item.unit} onChange={(event) => updateAapItem(item.id, 'unit', event.target.value)} /></td><td className="p-2"><input className={inputClass} value={item.validity} onChange={(event) => updateAapItem(item.id, 'validity', event.target.value)} /></td><td className="p-2"><input className={inputClass} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateAapItem(item.id, 'unitPrice', event.target.value)} /></td><td className="px-2 text-right tabular-nums">{formatAmount(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</td><td className="p-2"><button type="button" className="text-rose-700" aria-label={`Pašalinti ${item.name}`} onClick={() => setAapDraft((items) => items.filter((row) => row.id !== item.id))}><X size={16} /></button></td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">Bendra suma: {formatAmount(aapDraft.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0))} Eur</p><div className="flex gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => setAapDraft((items) => [...items, { id: `aap-${Date.now()}`, name: '', reason: '', quantity: 1, unit: 'Vnt.', validity: '', unitPrice: '' }])}><Plus size={15} />Pridėti priemonę</button><button className={buttonClass}>Išsaugoti AAP šabloną</button></div></div><p className="text-xs text-slate-500">Pakeitimai taikomi būsimiems parašams. Jau darbuotojo pasirašytas dokumentas išsaugo savo fiksuotą versiją.</p></form></Panel>}
            <LibraryFilters resources={visibleLibraryResources} resourceTypes={data.resourceTypes} selectedType={libraryTypeFilter} onTypeChange={setLibraryTypeFilter} search={librarySearch} onSearchChange={setLibrarySearch} />
            {filteredLibraryResources.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredLibraryResources.map((resource) => <div className="flex h-full flex-col gap-2" key={resource.id}><ResourceCard resource={resource} selected={currentOrg?.resources.includes(resource.id)} onToggle={(checked) => updateOrg(currentOrg.id, (org) => ({ ...org, resources: checked ? [...new Set([...org.resources, resource.id])] : org.resources.filter((id) => id !== resource.id) }))} onDelete={resource.organizationId === currentOrg?.id ? () => deleteCompanyProtocol(resource) : undefined} onSettings={resource.id === 'res-aap' ? undefined : () => openResourceSettings(resource)} onPreview={() => openResourcePreview(resource)} />{resource.type === 'Protokolas' && !resource.organizationId && <button type="button" className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => openCompanyProtocolForm(resource)}><Plus size={15} />Kurti atskirą protokolą</button>}</div>)}</div> : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Pagal pasirinktą tipą ir paiešką šablonų nerasta.</p>}</section>}

          {activeTab === 'uzduotys' && userRole === 'darbuotojas' && <section className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <PageTitle title="Mano užduotys" subtitle="Priskirti testai, žurnalai, kortelės ir protokolai." />
              <label className="relative block w-full lg:max-w-xs"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Ieškoti užduočių..." /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric accent="blue" label="Mano užduotys" value={currentEmployee?.resourceIds.length ?? 0} /><Metric accent="amber" label="Laukia mano veiksmo" value={pendingResourceIds.length} /><Metric accent="blue" label="Pradėta" value={startedCount} /><Metric accent="amber" label="Užbaigta, nepasirašyta" value={unsignedCount} /><Metric accent="green" label={pinSignedStatusLabel} value={workerSignedCount} /></div>
            {currentEmployee?.status !== 'Aktyvus' && !hasSavedAapSizes(currentEmployee) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">Užpildykite ir išsaugokite AAP dydžius, kad galėtumėte atidaryti AAP kortelę.</div>}
            <div className="flex gap-6 overflow-x-auto border-b border-slate-200 text-sm font-semibold" role="tablist" aria-label="Užduočių filtras">
              {[
                ['visos', 'Visos užduotys', employeeResources.length],
                ['atliktinos', 'Mano priskirtos', pendingResourceIds.length],
                ['baigtos', 'Baigtos', workerSignedCount],
              ].map(([filter, label, count]) => <button key={filter} role="tab" aria-selected={taskFilter === filter} onClick={() => setTaskFilter(filter)} className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 ${taskFilter === filter ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{count}</span></button>)}
            </div>
            {visibleEmployeeResources.length ? <section className="space-y-3"><div className="flex items-baseline justify-between border-b border-slate-200 pb-2"><h2 className="font-bold">Priskirtos užduotys</h2><span className="text-xs text-slate-500">{visibleEmployeeResources.length} užduotys</span></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{visibleEmployeeResources.map((resource) => { const aapSizesMissing = resource.id === 'res-aap' && !hasSavedAapSizes(currentEmployee); const workflowStatus = aapSizesMissing ? { key: 'needsSizes', label: 'AAP dydžiai nenustatyti' } : getTaskStatus(currentEmployee, resource); const workerHasSigned = ['signed', 'awaitingDss', 'awaitingEmployer', 'awaitingCommission', 'awaitingSignatures'].includes(workflowStatus.key); return <ResourceCard key={resource.id} resource={resource} workflowStatus={workflowStatus} onPreview={workerHasSigned ? () => openResourcePreview(resource) : undefined} onComplete={workerHasSigned ? undefined : () => openResourcePreview(resource)} />; })}</div></section> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Pagal pasirinktą filtrą užduočių nerasta.</div>}
          </section>}

          {activeTab === 'aap' && userRole === 'darbuotojas' && <section className="max-w-3xl space-y-5">
            <PageTitle title="Mano AAP dydžiai" subtitle="Užpildykite dydžius, reikalingus AAP kortelei; juos galėsite pakeisti vėliau." />
            <Panel title="AAP išdavimų istorija">
              {(data.aapIssuances ?? []).filter((issuance) => issuance.employeeId === currentEmployee?.id).length
                ? <div className="space-y-3">{(data.aapIssuances ?? []).filter((issuance) => issuance.employeeId === currentEmployee?.id).slice().sort((left, right) => right.issuedAt.localeCompare(left.issuedAt)).map((issuance) => <article className="rounded-lg border border-slate-200 p-4" key={issuance.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Išduota {formatProtocolDate(issuance.issuedAt)}</h2><span className={issuance.status === 'signed' ? 'text-sm font-semibold text-emerald-800' : 'text-sm font-semibold text-amber-800'}>{issuance.status === 'signed' ? 'Patvirtinta' : 'Laukia jūsų patvirtinimo'}</span></div>
                  <ul className="mt-2 list-inside list-disc text-sm text-slate-700">{issuance.items.map((item) => <li key={item.id}>{item.name} · {item.quantity} {item.unit}{item.reason ? ` · ${item.reason}` : ''}{item.validity ? ` · ${item.validity}` : ''}</li>)}</ul>
                  <p className="mt-2 text-xs text-slate-500">Išdavė: {issuance.issuedBy}</p>
                  {issuance.status !== 'signed' && <button type="button" className={`${buttonClass} mt-3`} onClick={() => { setAapIssueSigningTarget(issuance.id); setSignatureInk(''); setWorkerSignPin(''); setAapIssueSignError(''); }}><FileSignature size={15} />Patvirtinti gavimą</button>}
                  {issuance.signedAt && <p className="mt-3 text-xs text-slate-500">Pasirašyta {new Date(issuance.signedAt).toLocaleString('lt-LT')} · PIN · IP {issuance.ip ?? 'Nenurodytas'}</p>}
                  <SignatureImagePreview signature={issuance} />
                  {issuance.status === 'signed' && <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline" onClick={() => downloadAapIssuance(issuance)}><Download size={15} />PDF patvirtinimas</button>}
                </article>)}</div>
                : <p className="text-sm text-slate-500">Naujų AAP išdavimų dar nėra.</p>}
            </Panel>
            <Panel title="Asmeninės apsaugos priemonės"><div className="grid gap-4 sm:grid-cols-2">{[['shoes', 'Batų dydis'], ['clothes', 'Drabužių dydis'], ['pants', 'Kelnių dydis'], ['jacket', 'Striukės dydis'], ['height', 'Ūgis (cm)'], ['weight', 'Svoris (kg)'], ['helmet', 'Šalmo dydis']].map(([key, label]) => <label key={key} className="text-sm font-medium">{label}<input className={`${inputClass} mt-1`} value={currentEmployee?.sizes[key] ?? ''} onChange={(event) => setData((current) => ({ ...current, employees: current.employees.map((employee) => employee.id === currentEmployee.id ? { ...employee, sizes: { ...employee.sizes, [key]: event.target.value } } : employee) }))} /></label>)}</div><button className={`${buttonClass} mt-5`} onClick={() => { const complete = hasCompleteAapSizes(currentEmployee); if (!complete) { setNotice('Užpildykite batų, drabužių, kelnių ir striukės dydžius.'); return; } setData((current) => ({ ...current, employees: current.employees.map((employee) => employee.id === currentEmployee.id ? { ...employee, aapCompleted: true, status: employee.pin ? 'Aktyvus' : 'Pakviestas' } : employee) })); setNotice('AAP dydžiai išsaugoti. Dydžius galėsite atnaujinti vėliau.'); setActiveTab('uzduotys'); }}>Išsaugoti dydžius</button></Panel>
          </section>}

          {activeTab === 'zurnalai' && userRole === 'dss' && <section className="space-y-5"><PageTitle title="Įmonės žurnalai ir parašai" subtitle="Pasirašykite dokumentus po vieną arba pasirinkite kelis, peržiūrėkite juos ir patvirtinkite vienu PIN." /><Panel title={`${currentOrg?.name} · laukia DSS parašo`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={currentDssTasks.length > 0 && currentDssTasks.every((task) => selectedDssTaskIds.includes(task.id))} disabled={!currentDssTasks.length} onChange={(event) => setSelectedDssTaskIds(event.target.checked ? currentDssTasks.map((task) => task.id) : [])} />Pasirinkti visus ({currentDssTasks.length})</label><button type="button" className={buttonClass} disabled={!selectedDssTaskIds.some((id) => currentDssTasks.some((task) => task.id === id))} onClick={() => requestDssSign(currentDssTasks.filter((task) => selectedDssTaskIds.includes(task.id)))}><FileSignature size={16} />Pasirašyti pasirinktus ({currentDssTasks.filter((task) => selectedDssTaskIds.includes(task.id)).length})</button></div>
            <DataTable headers={['Pasirinkti', 'Darbuotojas', 'Dokumentas', 'Darbuotojo parašas', 'Veiksmas']} rows={currentDssTasks.map((task) => [<input type="checkbox" aria-label={`Pasirinkti ${task.signer} dokumentą`} checked={selectedDssTaskIds.includes(task.id)} onChange={(event) => setSelectedDssTaskIds((current) => event.target.checked ? [...new Set([...current, task.id])] : current.filter((id) => id !== task.id))} />, task.signer, data.resources.find((resource) => resource.id === task.resourceId)?.title ?? 'Dokumentas', new Date(task.signedAt).toLocaleString('lt-LT'), <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => requestDssSign([task])}>Pasirašyti</button>])} empty="Šioje įmonėje laukiančių DSS parašų nėra." />
          </Panel><Panel title="Parašų istorija"><PaginatedSignatureHistory
            key={`${currentOrg?.id ?? ''}:organization-history`}
            organizationId={currentOrg?.id}
            signatures={data.signatures.filter((signature) => signature.orgId === currentOrg?.id)}
            resources={data.resources}
            employees={[...orgEmployees, ...archivedOrgEmployees.map((record) => record.employee)]}
            archivedEmployees={archivedOrgEmployees}
            cloudMode={cloudMode}
          /></Panel></section>}

          {activeTab === 'parasai' && (userRole === 'darbuotojas' || userRole === 'dss') && <section className="space-y-5"><PageTitle title="Mano parašai" subtitle="Pasirašytų dokumentų data, veiksmo rolė ir demo aplinkos IP žyma." /><Panel title={userRole === 'darbuotojas' ? currentEmployee?.name : currentSpecialist?.name}><PaginatedSignatureHistory
            key={`${currentOrg?.id ?? ''}:${userRole === 'darbuotojas' ? currentEmployee?.id ?? '' : cloudUserId}:personal-history`}
            organizationId={currentOrg?.id}
            employeeId={userRole === 'darbuotojas' ? currentEmployee?.id : undefined}
            signerUserId={userRole === 'dss' ? cloudUserId : undefined}
            signatures={userRole === 'darbuotojas' ? employeeSignatures : data.signatures.filter((signature) => signature.signer === currentSpecialist?.name)}
            resources={data.resources}
            employees={orgEmployees}
            cloudMode={cloudMode}
          /></Panel></section>}

          {activeTab === 'ataskaitos' && userRole === 'vadovas' && <section className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3"><PageTitle title="Ataskaitos" subtitle="Dokumentų eiga, darbuotojų testų rezultatai ir užfiksuoti parašai." /><div className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Turinio tipas<select className={`${inputClass} mt-1 min-w-48`} value={reportTypeFilter} onChange={(event) => { setReportTypeFilter(event.target.value); setReportTestTargetId(null); }}><option value="visos">Visi turinio tipai</option>{data.resourceTypes.map((type) => <option key={type} value={type}>{resourceTypeDisplayNames[type] ?? type}</option>)}</select></label><button className={`${buttonClass} print:hidden`} onClick={() => window.print()}><FileText size={16} />Spausdinti ataskaitą</button></div></div>
            {reportTestTarget ? <section className="space-y-3"><button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-900" onClick={() => setReportTestTargetId(null)}><ChevronLeft size={17} />Grįžti į testus</button><Panel title={reportTestTarget.title}><DataTable headers={['Vardas', 'Pavardė', 'Rezultatas', 'Išlaikė', 'Data ir laikas', 'IP adresas']} rows={selectedTestResults.map(({ employee, result }) => { const [firstName, ...lastNameParts] = employee.name.trim().split(/\s+/); return [firstName ?? '', lastNameParts.join(' '), `${result.score}%`, result.passed ? 'Taip' : 'Ne', new Date(result.completedAt).toLocaleString('lt-LT'), result.ip ?? 'Nenurodytas']; })} empty="Darbuotojai šio testo dar nesprendė." /></Panel></section> : <>
              {reportTypeFilter !== 'Testas' && <div className="space-y-6">{reportJournalGroups.map(({ type, title, resources }) => <section key={type} className="space-y-3"><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">Įmonės {title.toLocaleLowerCase('lt')} ir jų peržiūra.</p></div>{resources.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{resources.map((resource) => <ReportResourceCard key={resource.id} resource={resource} employeeCount={reportEmployees.filter((employee) => employee.resourceIds?.includes(resource.id)).length} signatureCount={reportSignatures.filter((signature) => signature.resourceId === resource.id).length} onPreview={() => openResourcePreview(resource)} onDownload={() => openResourcePreview(resource, { autoPrint: true })} />)}</div> : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">Įmonei nepriskirta dokumentų šioje kategorijoje.</p>}</section>)}</div>}
              {reportTestResources.length > 0 && <section className="space-y-3"><div><h2 className="font-bold">Testai</h2><p className="mt-1 text-sm text-slate-500">Pasirinkite testą ir peržiūrėkite darbuotojų rezultatus.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{reportTestResources.map((resource) => { const attempts = reportTestResults.filter((entry) => entry.resource.id === resource.id); return <ReportTestCard key={resource.id} resource={resource} attemptCount={attempts.length} passedCount={attempts.filter(({ result }) => result.passed).length} onSelect={() => setReportTestTargetId(resource.id)} />; })}</div></section>}
              {reportTypeFilter === 'Testas' && reportTestResources.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Įmonė testų dar nepriskyrė.</p>}
              {reportTypeFilter !== 'Testas' && <div className="space-y-6">{reportCardGroups.map(({ type, title, resources }) => <section key={type} className="space-y-3"><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">Įmonės {title.toLocaleLowerCase('lt')} ir jų peržiūra.</p></div>{resources.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{resources.map((resource) => <ReportResourceCard key={resource.id} resource={resource} employeeCount={reportEmployees.filter((employee) => employee.resourceIds?.includes(resource.id)).length} signatureCount={reportSignatures.filter((signature) => signature.resourceId === resource.id).length} onPreview={() => openResourcePreview(resource)} onDownload={() => openResourcePreview(resource, { autoPrint: true })} />)}</div> : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">Įmonei nepriskirta dokumentų šioje kategorijoje.</p>}</section>)}</div>}
              {(reportTypeFilter === 'visos' || reportTypeFilter === 'Kortelė') && reportAapResource && <section className="space-y-3"><div><h2 className="font-bold">Asmeninės apsaugos priemonės</h2><p className="mt-1 text-sm text-slate-500">Ieškokite darbuotojo ir atidarykite tik jo AAP kortelę arba atsisiųskite visų darbuotojų korteles.</p></div><Panel title="AAP pagal darbuotoją">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><label className="block w-full max-w-xl text-sm font-medium">Ieškoti darbuotojo<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input className={`${inputClass} pl-9`} value={reportAapSearch} onChange={(event) => setReportAapSearch(event.target.value)} placeholder="Vardas, pavardė, pareigos arba sutarties Nr." /></div></label><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!reportAapEmployees.length} onClick={() => openResourcePreview(reportAapResource)}><Eye size={16} />Visų peržiūra</button><button type="button" className={buttonClass} disabled={!reportAapEmployees.length} onClick={() => openResourcePreview(reportAapResource, { autoPrint: true })}><Download size={16} />Atsisiųsti visas AAP PDF</button></div></div>
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-sm text-slate-500"><span>Darbuotojai: <strong className="text-slate-800">{filteredReportAapEmployees.length}</strong></span>{reportAapSearch && <button type="button" className="font-semibold text-emerald-800 hover:text-emerald-900" onClick={() => setReportAapSearch('')}>Išvalyti paiešką</button>}</div>
                {filteredReportAapEmployees.length ? <div className="divide-y divide-slate-100">{filteredReportAapEmployees.slice(0, 8).map((employee) => <div key={employee.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-48 flex-1"><p className="font-semibold text-slate-900">{employee.name}</p><p className="mt-0.5 text-sm text-slate-500">{employee.position || 'Darbuotojas'}{employee.contractNumber ? ` · Sutartis ${employee.contractNumber}` : ''}</p></div><span className={`text-xs font-semibold ${hasCurrentWorkerSignature(employee.id, 'res-aap') ? 'text-emerald-700' : 'text-amber-700'}`}>{hasCurrentWorkerSignature(employee.id, 'res-aap') ? 'AAP kortelė pasirašyta' : 'Laukia darbuotojo parašo'}</span><div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => openResourcePreview(reportAapResource, { employeeId: employee.id })}><Eye size={15} />Peržiūrėti</button><button type="button" className={buttonClass} onClick={() => openResourcePreview(reportAapResource, { employeeId: employee.id, autoPrint: true })}><Download size={15} />PDF</button></div></div>)}</div> : <p className="rounded-md border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{reportAapEmployees.length ? 'Pagal paiešką darbuotojų nerasta.' : 'AAP kortelės dar nepriskirtos darbuotojams.'}</p>}
                {filteredReportAapEmployees.length > 8 && <p className="mt-2 text-sm text-slate-500">Rodomi pirmi 8 iš {filteredReportAapEmployees.length}. Patikslinkite paiešką, kad greičiau rastumėte darbuotoją.</p>}
              </Panel></section>}
              {reportTypeFilter !== 'Testas' && <div className="space-y-6">{reportProtocolGroups.map(({ type, title, resources }) => <section key={type} className="space-y-3"><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">Įmonės {title.toLocaleLowerCase('lt')} ir jų peržiūra.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{resources.map((resource) => <ReportResourceCard key={resource.id} resource={resource} employeeCount={reportEmployees.filter((employee) => employee.resourceIds?.includes(resource.id)).length} signatureCount={reportSignatures.filter((signature) => signature.resourceId === resource.id).length} onPreview={() => openResourcePreview(resource)} onDownload={() => openResourcePreview(resource, { autoPrint: true })} />)}</div></section>)}</div>}
            </>}
            {!reportTestTarget && protocolRegistryPanel}
          </section>}

          {activeTab === 'archyvas' && userRole === 'vadovas' && <section className="archive-page space-y-5">
            <div className="archive-print-controls flex flex-wrap items-end justify-between gap-3"><PageTitle title="Archyvas" subtitle="Atleisti darbuotojai ir jų nekintama pasirašymo istorija." /><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!archivedOrgEmployees.length} onClick={() => setArchivePrintMode('all')}><Download size={16} />Atsisiųsti visą archyvą</button>{creatorReadOnlyPreview && <button type="button" className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40" disabled={!archivedOrgEmployees.length} onClick={() => deleteCreatorArchivedEmployees(currentOrg)}><Trash2 size={16} />Ištrinti visą archyvą</button>}</div></div>
            <p className="archive-print-controls text-sm text-slate-500">Archyvo įrašai skirti tik peržiūrai: pasirašymo datos ir kiti duomenys nekoreguojami.</p>
            {archivedOrgEmployees.length ? <div className="archive-print-controls grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{archivedOrgEmployees.map((record) => <button key={record.id} type="button" className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-emerald-700 hover:bg-emerald-50/40" onClick={() => setArchiveDetailsId(record.id)}><span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{record.employee.name}</span><span className="mt-1 block text-xs text-slate-500">Sutartis: {record.employee.contractNumber || 'Nenurodyta'} · {record.signatures.length} parašų</span></span><ChevronRight size={18} className="shrink-0 text-slate-400" /></button>)}</div> : <p className="archive-print-controls rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Šios įmonės archyve darbuotojų dar nėra.</p>}
            {archivePrintMode === 'all' && <div className="archive-print-target archive-print-all"><h1 className="mb-2 text-2xl font-bold">{currentOrg?.name} · Darbuotojų archyvas</h1><p className="mb-6 text-sm text-slate-500">Archyvuota {new Date().toLocaleString('lt-LT')}</p>{archivedOrgEmployees.map((record) => <ArchiveEmployeeDetails key={record.id} record={record} organizationName={currentOrg?.name} />)}</div>}
          </section>}

          {archiveDetailRecord && <div className={`fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 ${archivePrintMode === `record:${archiveDetailRecord.id}` ? 'archive-print-target' : 'archive-print-controls'}`}><section className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-5"><div className="archive-print-controls mb-4 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-800">Archyvas · {recordSignaturesLabel(archiveDetailRecord.signatures.length)}</p><h2 className="text-xl font-bold">{archiveDetailRecord.employee.name}</h2></div><div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => setArchivePrintMode(`record:${archiveDetailRecord.id}`)}><Download size={16} />Atsisiųsti PDF</button>{creatorReadOnlyPreview && <button type="button" className="rounded-md border border-rose-300 bg-rose-50 p-2 text-rose-800 hover:bg-rose-100" title="Ištrinti archyvo įrašą" onClick={() => deleteCreatorArchivedEmployees(currentOrg, [archiveDetailRecord.id])}><Trash2 size={18} /></button>}<button type="button" aria-label="Uždaryti archyvo įrašą" className="rounded-md border border-slate-300 p-2" onClick={() => setArchiveDetailsId(null)}><X size={18} /></button></div></div><ArchiveEmployeeDetails record={archiveDetailRecord} organizationName={currentOrg?.name} /></section></div>}

          {activeTab === 'paskyra' && (userRole === 'darbuotojas' || userRole === 'dss') && <section className="max-w-2xl space-y-5"><PageTitle title="Paskyra ir parašo PIN" subtitle={cloudMode ? 'PIN saugomas užšifruotai ir naudojamas dokumentų parašams patvirtinti.' : 'PIN vietiniame demo saugomas tik šios naršyklės duomenyse.'} /><Panel title={userRole === 'darbuotojas' ? currentEmployee?.name : `${currentSpecialist?.name} · nemokama DSS paskyra`}><form onSubmit={savePin} className="max-w-sm space-y-3">{cloudMode && <label className="block text-sm font-medium">Dabartinis PIN<input className={`${inputClass} mt-1`} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" type="password" autoComplete="current-password" value={workerCurrentPin} onChange={(event) => setWorkerCurrentPin(event.target.value)} required /></label>}<label className="block text-sm font-medium">Naujas 4 skaitmenų PIN<input className={`${inputClass} mt-1`} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" type="password" autoComplete="new-password" value={pinDraft} onChange={(event) => setPinDraft(event.target.value)} required /></label><label className="block text-sm font-medium">Pakartokite PIN<input className={`${inputClass} mt-1`} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" type="password" autoComplete="new-password" value={pinConfirm} onChange={(event) => setPinConfirm(event.target.value)} required /></label><button className={buttonClass}><LockKeyhole size={16} />{cloudMode ? 'Pakeisti PIN' : 'Nustatyti PIN'}</button></form></Panel></section>}

          {activeTab === 'imones' && userRole === 'kurejas' && <section className="space-y-5">
            <PageTitle title="Įmonės" subtitle="Pasirinkite įmonę, kad įkeltumėte tik jos darbo srities duomenis." />
            <Panel title="Visos įmonės">
              <label className="relative mb-4 block w-full max-w-xl text-sm font-medium"><span className="sr-only">Ieškoti įmonės</span><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input type="search" className={`${inputClass} pl-9`} value={creatorOrganizationSearch} onChange={(event) => { setCreatorOrganizationSearch(event.target.value); setCreatorOrganizationPage(1); }} placeholder="Ieškoti pagal įmonės pavadinimą ar kodą" /></label>
              <DataTable headers={['Įmonė', 'Vadovai', 'DSS specialistai', 'Veiksmai']} rows={paginatedCreatorOrganizations.map(({ organization, managers, specialists }) => [
                organization.name,
                managers.map((account) => account.fullName || account.email).join(', ') || 'Nenurodytas',
                specialists.map((account) => account.fullName || account.email).join(', ') || 'Nepriskirti',
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50" onClick={() => onCreatorPreview(organization.id, 'vadovas')}>Peržiūrėti kaip vadovas</button>
                  <button type="button" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50" onClick={() => onCreatorPreview(organization.id, 'dss')}>Peržiūrėti kaip DSS</button>
                  <button type="button" className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100" onClick={() => deleteCreatorOrganization(organization)}>Ištrinti įmonę</button>
                </div>,
              ])} empty="Įmonių pagal paiešką nerasta." />
              {creatorOrganizations.length > 0 && <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm"><span className="text-slate-500">Įmonių: {creatorOrganizations.length}</span><nav className="flex items-center gap-2" aria-label="Įmonių puslapiavimas"><button type="button" className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={creatorOrganizationPage <= 1} onClick={() => setCreatorOrganizationPage((page) => Math.max(1, page - 1))}>Atgal</button><span>{Math.min(creatorOrganizationPage, creatorOrganizationPageCount)} / {creatorOrganizationPageCount}</span><button type="button" className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={creatorOrganizationPage >= creatorOrganizationPageCount} onClick={() => setCreatorOrganizationPage((page) => Math.min(creatorOrganizationPageCount, page + 1))}>Toliau</button></nav></div>}
              <p className="mt-3 text-xs text-slate-500">Darbuotojai, parašai ir dokumentai įkeliami tik atidarius pasirinktos įmonės peržiūrą.</p>
            </Panel>
          </section>}

          {activeTab === 'paskyros' && userRole === 'kurejas' && <section className="space-y-5">
            <PageTitle title="Paskyros" subtitle="Registruoti įmonių vadovai ir DSS specialistai." />
            <Panel title="Vadovai ir DSS specialistai">
              <label className="relative mb-4 block w-full max-w-xl text-sm font-medium"><span className="sr-only">Ieškoti paskyros</span><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input type="search" className={`${inputClass} pl-9`} value={creatorAccountSearch} onChange={(event) => { setCreatorAccountSearch(event.target.value); setCreatorAccountPage(1); }} placeholder="Ieškoti pagal vardą, el. paštą ar įmonę" /></label>
              <DataTable headers={['Vardas', 'El. paštas', 'Paskyros tipas', 'Įmonės']} rows={paginatedCreatorAccounts.map((account) => [account.fullName || 'Vardas nenurodytas', account.email, account.accountType === 'manager' ? 'Vadovas' : 'DSS specialistas', (account.organizations ?? []).map((organization) => organization.name).join(', ') || 'Nepriskirtas'])} empty="Paskyrų pagal paiešką nerasta." />
              {creatorAccountsFiltered.length > 0 && <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm"><span className="text-slate-500">Paskyrų: {creatorAccountsFiltered.length}</span><nav className="flex items-center gap-2" aria-label="Paskyrų puslapiavimas"><button type="button" className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={creatorAccountPage <= 1} onClick={() => setCreatorAccountPage((page) => Math.max(1, page - 1))}>Atgal</button><span>{Math.min(creatorAccountPage, creatorAccountPageCount)} / {creatorAccountPageCount}</span><button type="button" className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={creatorAccountPage >= creatorAccountPageCount} onClick={() => setCreatorAccountPage((page) => Math.min(creatorAccountPageCount, page + 1))}>Toliau</button></nav></div>}
            </Panel>
          </section>}

          {activeTab === 'prenumerata' && userRole === 'vadovas' && <section className="max-w-2xl space-y-5"><PageTitle title="Įmonės prenumerata" subtitle="Demo leidžia peržiūrėti būsenas ir išbandyti pratęsimo bei atšaukimo veiksmus; mokėjimai neprijungti." /><Panel title={currentOrg?.name}><SubscriptionCard subscription={data.subscriptions.find((item) => item.orgId === currentOrg?.id)} onAction={updateSubscription} /></Panel></section>}

          {activeTab === 'prenumeratos' && userRole === 'kurejas' && <section className="space-y-5"><PageTitle title="Prenumeratų valdymas" subtitle="Peržiūrėkite aktyvias, pasibaigusias ir atšauktas įmonių prenumeratas." /><Panel title="Visos įmonės"><DataTable headers={['Įmonė', 'Planą', 'Būsena', 'Galioja iki', 'Veiksmai']} rows={data.subscriptions.map((subscription) => [data.organizations.find((org) => org.id === subscription.orgId)?.name ?? 'Įmonė', `${subscription.plan} · ${subscription.price} €/mėn.`, subscription.status, subscription.endsAt, <div className="flex gap-2"><button className="text-emerald-800 underline" onClick={() => updateSubscription(subscription.id, 'renew')}>Pratęsti</button>{subscription.status === 'Aktyvi' ? <button className="text-rose-700 underline" onClick={() => updateSubscription(subscription.id, 'cancel')}>Atšaukti</button> : <button className="text-emerald-800 underline" onClick={() => updateSubscription(subscription.id, 'restore')}>Atkurti</button>}</div>])} /></Panel><p className="text-xs text-slate-500">DSS specialistai neapmokestinami. Prenumerata priskiriama įmonei, ne atskirai specialisto paskyrai.</p></section>}

          {activeTab === 'biblioteka' && userRole === 'kurejas' && <section className="space-y-5"><PageTitle title="Turinio biblioteka" subtitle="Kurti ir tvarkyti įmonėms prieinamus testų, žurnalų, kortelių ir protokolų šablonus." />
            <Panel title="Turinio tipai"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{data.resourceTypes.map((type) => <div key={type} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"><span className="text-sm font-semibold">{resourceTypeDisplayNames[type] ?? type}</span><span className="text-xs text-slate-500">{data.resources.filter((resource) => resource.type === type).length} šablonų</span></div>)}</div></Panel>
            <Panel title={editingResourceId ? 'Redaguoti šabloną' : 'Naujas šablonas'}>
              <form id="resource-editor" onSubmit={addResource} className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">Pavadinimas<input className={`${inputClass} mt-1`} required value={resourceForm.title} onChange={(event) => setResourceForm({ ...resourceForm, title: event.target.value })} placeholder="Pvz., Darbas su keltuvu" /></label>
                <label className="text-sm font-medium">Turinio tipas<select className={`${inputClass} mt-1`} value={resourceForm.type} onChange={(event) => { const type = event.target.value; const requiredSigners = editingResourceId === 'res-aap' ? ['Darbuotojas', 'Vadovas'] : ['Žurnalas', 'Kortelė'].includes(type) ? ['Darbuotojas', 'DSS specialistas'] : ['Darbuotojas']; setResourceForm((current) => ({ ...current, type, requiredSigners })); }}>{data.resourceTypes.map((type) => <option key={type} value={type}>{resourceTypeDisplayNames[type] ?? type}</option>)}</select></label>
                <label className="text-sm font-medium">Kategorija<input className={`${inputClass} mt-1`} value={resourceForm.category} onChange={(event) => setResourceForm({ ...resourceForm, category: event.target.value })} placeholder="Priešgaisrinė sauga" /></label>
                <label className="text-sm font-medium">Galiojimas (mėn.)<input className={`${inputClass} mt-1`} type="number" min="1" max="120" value={resourceForm.validityMonths} onChange={(event) => setResourceForm({ ...resourceForm, validityMonths: event.target.value })} /></label>
                <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3 md:col-span-2"><legend className="px-1 text-sm font-semibold">Kas turi pasirašyti</legend><div className="grid gap-2 sm:grid-cols-2">{[['Darbuotojas', 'Darbuotojas'], ['Vadovas', 'Įmonės vadovas'], ['DSS specialistas', 'DSS specialistas'], ['Komisijos narys', 'Komisijos nariai']].map(([role, label]) => <label key={role} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resourceForm.requiredSigners.includes(role)} disabled={role === 'Darbuotojas'} onChange={(event) => setResourceForm((current) => ({ ...current, requiredSigners: event.target.checked ? [...new Set([...current.requiredSigners, role])] : current.requiredSigners.filter((item) => item !== role) }))} />{label}{role === 'Darbuotojas' && <span className="text-xs text-slate-500">(privalomas)</span>}</label>)}</div><p className="text-xs text-slate-500">Komisijos narių parašo reikės kiekvienam įmonės komisijos nariui.</p></fieldset>
                <label className={`flex cursor-pointer items-center gap-2 self-end rounded-lg border border-slate-300 px-3 py-2 text-sm ${resourceFileUploading ? 'pointer-events-none opacity-60' : ''}`}><Upload size={16} />{resourceFileUploading ? 'Įkeliamas failas…' : editingResourceId ? 'Pakeisti HTML failą' : 'Įkelti HTML šabloną'}<input className="sr-only" type="file" accept=".html,.htm,text/html" disabled={resourceFileUploading} onChange={(event) => handleResourceFile(event.target.files?.[0], 'html')} /></label>
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm ${resourceFileUploading ? 'pointer-events-none opacity-60' : ''}`}><ImagePlus size={16} />{resourceFileUploading ? 'Įkeliamas failas…' : 'Priskirti viršelio nuotrauką'}<input className="sr-only" type="file" accept="image/*" disabled={resourceFileUploading} onChange={(event) => handleResourceFile(event.target.files?.[0], 'image')} /></label>
                {resourceForm.image && <img className="h-16 w-28 rounded-md object-cover" src={resourceForm.image} alt="Pasirinktas viršelis" />}
                {resourceForm.html && <p className="self-center text-xs text-emerald-800">HTML paruoštas · {new DOMParser().parseFromString(resourceForm.html, 'text/html').body.textContent?.trim().slice(0, 90) || 'Tuščias dokumentas'}</p>}
                <details className="rounded-lg border border-slate-200 p-3 md:col-span-2"><summary className="cursor-pointer text-sm font-semibold">Redaguoti HTML turinį</summary><label className="mt-3 block text-sm font-medium">HTML kodas<textarea className={`${inputClass} mt-1 min-h-64 font-mono text-xs`} spellCheck={false} value={resourceForm.html} onChange={(event) => setResourceForm((current) => ({ ...current, html: event.target.value }))} /></label></details>
                {resourceForm.type === 'Testas' && <div className="space-y-3 rounded-lg border border-slate-200 p-4 md:col-span-2"><div className="flex items-center justify-between"><h3 className="font-semibold">Testo klausimai</h3><button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setDraftQuestions((current) => [...current, { prompt: '', options: ['', ''], correctIndex: 0 }])}>Pridėti klausimą</button></div>{draftQuestions.map((question, questionIndex) => { const multipleAnswers = Array.isArray(question.correctIndices); const correctIndices = multipleAnswers ? question.correctIndices : [question.correctIndex]; return <fieldset className="space-y-2 rounded-md bg-slate-50 p-3" key={questionIndex}><div className="flex items-center gap-2"><label className="flex-1 text-sm font-medium">Klausimas {questionIndex + 1}<input className={`${inputClass} mt-1`} required value={question.prompt} onChange={(event) => setDraftQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, prompt: event.target.value } : item))} /></label>{draftQuestions.length > 1 && <button type="button" className="mt-5 text-sm text-rose-700" onClick={() => setDraftQuestions((current) => current.filter((_, index) => index !== questionIndex))}>Pašalinti</button>}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={multipleAnswers} onChange={(event) => setDraftQuestions((current) => current.map((item, index) => {
                  if (index !== questionIndex) return item;
                  if (event.target.checked) return { ...item, correctIndices: Number.isInteger(item.correctIndex) ? [item.correctIndex] : [], correctIndex: undefined };
                  const [correctIndex = 0] = item.correctIndices ?? [];
                  const singleAnswerQuestion = { ...item, correctIndex };
                  delete singleAnswerQuestion.correctIndices;
                  return singleAnswerQuestion;
                }))} />Klausime gali būti keli teisingi atsakymai</label>{multipleAnswers && <p className="text-xs text-slate-600">Pažymėkite visus teisingus variantus.</p>}<div className="grid gap-2 sm:grid-cols-2">{question.options.map((option, optionIndex) => <div className="flex items-center gap-2" key={optionIndex}><input type={multipleAnswers ? 'checkbox' : 'radio'} name={`correct-${questionIndex}`} aria-label={`Pažymėti atsakymą ${optionIndex + 1} kaip teisingą`} checked={correctIndices.includes(optionIndex)} onChange={(event) => setDraftQuestions((current) => current.map((item, index) => {
                    if (index !== questionIndex) return item;
                    if (!multipleAnswers) return { ...item, correctIndex: optionIndex };
                    const selected = item.correctIndices ?? [];
                    return { ...item, correctIndices: event.target.checked ? [...new Set([...selected, optionIndex])] : selected.filter((answerIndex) => answerIndex !== optionIndex) };
                  }))} /><input className={inputClass} required aria-label={`Klausimo ${questionIndex + 1} atsakymo variantas ${optionIndex + 1}`} value={option} onChange={(event) => setDraftQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, options: item.options.map((answer, answerIndex) => answerIndex === optionIndex ? event.target.value : answer) } : item))} placeholder={`Atsakymas ${optionIndex + 1}`} /><span className="whitespace-nowrap text-xs">Teisingas</span></div>)}</div></fieldset>; })}</div>}
                <div className="flex justify-end gap-2 md:col-span-2">{editingResourceId && <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" disabled={resourceSaving} onClick={resetResourceForm}>Atšaukti</button>}<button className={buttonClass} disabled={resourceSaving || resourceFileUploading}>{resourceSaving ? 'Išsaugoma…' : <>{editingResourceId ? <Check size={16} /> : <Plus size={16} />}{editingResourceId ? 'Išsaugoti pakeitimus' : 'Įtraukti į biblioteką'}</>}</button></div>
              </form>
              <p className="mt-3 text-xs text-slate-500">Failai iki 1,5 MB saugomi tik naršyklėje. HTML peržiūra izoliuota; testo vertinimo klausimus suveskite formoje. El. laiškai ir failų serveris bus prijungti vėliau.</p>
            </Panel>
            <LibraryFilters resources={data.resources} resourceTypes={data.resourceTypes} selectedType={libraryTypeFilter} onTypeChange={setLibraryTypeFilter} search={librarySearch} onSearchChange={setLibrarySearch} />
            {filteredLibraryResources.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredLibraryResources.map((resource) => <div key={resource.id} className="flex h-full flex-col gap-2"><ResourceCard resource={resource} onPreview={() => openResourcePreview(resource)} onDelete={() => deleteCreatorResource(resource)} /><button type="button" className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => editResource(resource)}><Pencil size={15} />Redaguoti šabloną</button></div>)}</div> : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Pagal pasirinktą tipą ir paiešką šablonų nerasta.</p>}
          </section>}
        </div>
        {resourceSettingsTarget && (resourceSettingsTarget.templateKind === 'knowledge-assessment-protocol'
          ? <ProtocolSettingsDialog resource={resourceSettingsTarget} settings={resourceSettingsDraft} onChange={setResourceSettingsDraft} onSave={saveResourceSettings} onClose={() => setResourceSettingsTarget(null)} />
          : <ResourceSettingsDialog resource={resourceSettingsTarget} settings={resourceSettingsDraft} onChange={setResourceSettingsDraft} onSave={saveResourceSettings} onClose={() => setResourceSettingsTarget(null)} />)}
      </main>

      {previewResource?.type === 'Testas' && quizResult?.resourceId === previewResource.id && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950 p-4"><section role="dialog" aria-modal="true" aria-labelledby="quiz-outcome-title" aria-live="polite" className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-xl"><h2 id="quiz-outcome-title" className={`text-3xl font-bold ${quizResult.passed ? 'text-emerald-800' : 'text-rose-700'}`}>{quizResult.passed ? 'Išlaikyta' : 'Neišlaikyta :('}</h2><p className="mt-2 text-sm text-slate-600">Rezultatas: {quizResult.score}%</p>{quizResult.passed ? <button type="button" className={`${buttonClass} mt-5`} onClick={() => { requestWorkerSign(currentEmployee, previewResource); setPreviewResource(null); }}><FileSignature size={16} />Pasirašyti</button> : <button type="button" className="mt-5 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => { setQuizResult(null); setQuizAnswers({}); }}>Bandyti dar kartą</button>}</section></div>}

      {protocolSource && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><form onSubmit={saveCompanyProtocol} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-800">{currentOrg?.name}</p><h2 className="mt-1 text-xl font-bold">Naujas protokolas</h2><p className="mt-1 text-sm text-slate-500">Ruošinys: {protocolSource.title}</p></div><button type="button" aria-label="Uždaryti" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setProtocolSource(null)}><X size={20} /></button></div><label className="block text-sm font-medium">Protokolo pavadinimas<input autoFocus required className={`${inputClass} mt-1`} value={protocolTitle} onChange={(event) => setProtocolTitle(event.target.value)} placeholder="Pvz., Gaisrinės saugos žinių patikrinimo protokolas" /></label><p className="mt-2 text-xs text-slate-500">Išsaugojus protokolas bus priskirtas įmonei; vėliau priskyrimą galėsite pakeisti bibliotekoje.</p><div className="mt-6 flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => setProtocolSource(null)}>Atšaukti</button><button className={buttonClass}><Check size={16} />Išsaugoti protokolą</button></div></form></div>}

      {previewResource && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><section className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl bg-white p-5"><div className="mb-4 flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-800">{previewResource.type} · {previewResource.category}</p><h2 className="text-xl font-bold">{previewResource.title}</h2></div><div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => printPdfHtml(previewResource.printHtml, previewResource.title).catch((error) => setNotice(`PDF paruošti nepavyko: ${error.message}`))}><Download size={16} />Atsisiųsti PDF</button><button type="button" aria-label="Uždaryti peržiūrą" onClick={() => setPreviewResource(null)}><X /></button></div></div>{previewResource.image && <img src={previewResource.image} alt="" className="mb-4 max-h-56 w-full rounded-lg object-cover" />}<iframe ref={previewFrameRef} title={previewResource.title} sandbox="allow-modals" srcDoc={previewResource.printHtml} className={previewResource.id === 'res-aap' ? 'h-[75vh] w-full rounded-lg border border-slate-200 bg-white' : 'h-64 w-full rounded-lg border border-slate-200'} />{userRole === 'darbuotojas' && (previewResource.type === 'Testas' ? <div className="mt-4 space-y-3">{previewResource.questions?.length ? <TestForm questions={previewResource.questions} answers={quizAnswers} setAnswers={setQuizAnswers} onSubmit={submitQuiz} /> : <p className="text-sm text-amber-800">Šiam testui dar nesukonfigūruoti klausimai.</p>}{quizResult?.resourceId === previewResource.id && <p className={`text-sm font-semibold ${quizResult.passed ? 'text-emerald-800' : 'text-rose-700'}`}>{quizResult.passed ? `Testas išlaikytas: ${quizResult.score}%.` : `Nepakanka teisingų atsakymų: ${quizResult.score}%. Bandykite dar kartą.`}</p>}{quizResult?.resourceId === previewResource.id && quizResult.passed && <button className={buttonClass} onClick={() => { requestWorkerSign(currentEmployee, previewResource); setPreviewResource(null); }}><FileSignature size={15} />Patvirtinti PIN parašu</button>}</div> : <div className="mt-4 space-y-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={readConfirmed} onChange={(event) => setReadConfirmed(event.target.checked)} />Susipažinau su dokumento turiniu ir patvirtinu jį savo PIN kodu.</label><button disabled={!readConfirmed} className={buttonClass} onClick={() => { completeReadThenSign(currentEmployee, previewResource); setPreviewResource(null); }}><FileSignature size={15} />Pereiti prie PIN parašo</button></div>)}</section></div>}
      <dialog id="aap-issuance-dialog" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/60" onClose={() => { setAapIssueEmployeeId(null); setAapIssueSelectedItemIds([]); }}>
        {aapIssueEmployee && <form onSubmit={createAapIssuance} className="space-y-5">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Naujas AAP išdavimas</h2><p className="mt-1 text-sm text-slate-500">{aapIssueEmployee.name} · ankstesni pasirašyti įrašai nekeičiami.</p></div><button type="button" aria-label="Uždaryti AAP išdavimo formą" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => document.getElementById('aap-issuance-dialog')?.close()}><X size={20} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Išdavimo data<input className={`${inputClass} mt-1`} type="date" value={aapIssueDate} onChange={(event) => setAapIssueDate(event.target.value)} required /></label><label className="text-sm font-medium">Išdavė<input className={`${inputClass} mt-1`} value={aapIssueIssuer} onChange={(event) => setAapIssueIssuer(event.target.value)} required /></label></div>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Šį kartą išduodamos priemonės</legend>{aapIssueOrganization?.aapItems?.length ? aapIssueOrganization.aapItems.map((item) => <div className="grid items-center gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_8rem]" key={item.id}>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={aapIssueSelectedItemIds.includes(item.id)} onChange={(event) => setAapIssueSelectedItemIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} /><span className="font-semibold">{item.name}<small className="block font-normal text-slate-500">{item.reason || 'Pagrindas nenurodytas'} · {item.validity || 'Tinkamumo terminas nenurodytas'}</small></span></label>
            <label className="text-xs font-medium text-slate-600">Kiekis<input className={`${inputClass} mt-1`} type="number" min="1" step="1" value={aapIssueQuantities[item.id] ?? item.quantity ?? 1} onChange={(event) => setAapIssueQuantities((current) => ({ ...current, [item.id]: event.target.value }))} disabled={!aapIssueSelectedItemIds.includes(item.id)} /></label>
          </div>) : <p className="text-sm text-slate-500">AAP šablone nėra priemonių. Pirmiausia jas įrašykite įmonės bibliotekoje.</p>}</fieldset>
          <p className="text-xs text-slate-500">Įrašas bus išsaugotas atskirai. Darbuotojas patvirtins būtent šių priemonių gavimą savo paskyroje.</p>
          <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={() => document.getElementById('aap-issuance-dialog')?.close()}>Atšaukti</button><button type="submit" className={buttonClass} disabled={!aapIssueSelectedItemIds.length || !aapIssueOrganization?.aapItems?.length}><Plus size={15} />Registruoti išdavimą</button></div>
        </form>}
      </dialog>
      {aapIssueSigningTarget && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4"><form onSubmit={confirmAapIssueSign} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl bg-white p-6"><h2 className="text-lg font-bold">Patvirtinti AAP gavimą</h2><p className="text-sm text-slate-600">{(data.aapIssuances ?? []).find((issuance) => issuance.id === aapIssueSigningTarget)?.items.map((item) => `${item.name} (${item.quantity} ${item.unit})`).join(', ')}</p><SignaturePad value={signatureInk} onChange={setSignatureInk} /><label className="block text-sm font-medium">Jūsų 4 skaitmenų PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" autoComplete="current-password" value={workerSignPin} onChange={(event) => setWorkerSignPin(event.target.value)} required /></label>{aapIssueSignError && <p role="alert" className="text-sm text-rose-700">{aapIssueSignError}</p>}<div className="flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={aapIssueSignSubmitting} onClick={() => { setAapIssueSigningTarget(null); setSignatureInk(''); setWorkerSignPin(''); setAapIssueSignError(''); }}>Atšaukti</button><button className={buttonClass} disabled={aapIssueSignSubmitting || !signatureInk}>{aapIssueSignSubmitting ? 'Išsaugoma…' : <><FileSignature size={15} />Patvirtinti gavimą</>}</button></div></form></div>}
      {workerSigningTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><form onSubmit={confirmWorkerSign} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl bg-white p-6"><h2 className="text-lg font-bold">Patvirtinti darbuotojo parašą</h2><p className="text-sm text-slate-600">{data.resources.find((resource) => resource.id === workerSigningTarget.resourceId)?.title}</p><SignaturePad value={signatureInk} onChange={setSignatureInk} /><label className="block text-sm font-medium">Jūsų 4 skaitmenų PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" maxLength={4} value={workerSignPin} onChange={(event) => setWorkerSignPin(event.target.value)} required /></label>{workerSignError && <p role="alert" className="text-sm text-rose-700">{workerSignError}</p>}<div className="flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => { setWorkerSigningTarget(null); setSignatureInk(''); }}>Atšaukti</button><button className={buttonClass}><FileSignature size={15} />Pasirašyti</button></div></form></div>}
      {employerSigningTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><form onSubmit={confirmEmployerSign} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl bg-white p-6"><h2 className="text-lg font-bold">Patvirtinti darbdavio parašą</h2><p className="text-sm text-slate-600">{data.organizations.find((org) => org.id === employerSigningTarget.orgId)?.manager} · AAP išdavimo kortelė</p><SignaturePad value={signatureInk} onChange={setSignatureInk} /><label className="block text-sm font-medium">Įmonės vadovo 4 skaitmenų PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" maxLength={4} value={employerSignPin} onChange={(event) => setEmployerSignPin(event.target.value)} required /></label>{employerSignError && <p role="alert" className="text-sm text-rose-700">{employerSignError}</p>}<div className="flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => { setEmployerSigningTarget(null); setSignatureInk(''); }}>Atšaukti</button><button className={buttonClass}><FileSignature size={15} />Pasirašyti</button></div></form></div>}
      {dssSigningTasks.length > 0 && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><form onSubmit={signDssTask} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-white p-6"><h2 className="text-lg font-bold">DSS parašo patvirtinimas</h2><p className="text-sm text-slate-600">{currentSpecialist?.name} · {dssSigningTasks.length} dokumentų</p><div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">{dssSigningTasks.map((task) => <div key={task.id} className="text-sm"><p className="font-semibold">{data.employees.find((employee) => employee.id === task.employeeId)?.name ?? task.signer}</p><p className="text-slate-600">{data.resources.find((resource) => resource.id === task.resourceId)?.title ?? 'Dokumentas'}</p></div>)}</div>{dssSigningTasks.length > 1 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={dssReviewConfirmed} onChange={(event) => { setDssReviewConfirmed(event.target.checked); setDssSigningError(''); }} /><span>Patvirtinu, kad peržiūrėjau visus pasirinktus dokumentus.</span></label>}<SignaturePad value={signatureInk} onChange={setSignatureInk} /><label className="block text-sm font-medium">4 skaitmenų PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" maxLength={4} value={signPinDraft} onChange={(event) => { setSignPinDraft(event.target.value); setDssSigningError(''); }} required /></label>{dssSigningError && <p role="alert" className="text-sm text-rose-700">{dssSigningError}</p>}<div className="flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => { setDssSigningTasks([]); setSignPinDraft(''); setDssReviewConfirmed(false); setDssSigningError(''); setSignatureInk(''); }}>Atšaukti</button><button className={buttonClass} disabled={dssSigningTasks.length > 1 && !dssReviewConfirmed}><FileSignature size={15} />Pasirašyti ({dssSigningTasks.length})</button></div></form></div>}
    </div>
  );
}

function ArchiveEmployeeDetails({ record, organizationName }) {
  const employee = record.employee;
  const sizes = Object.entries(employee.sizes ?? {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`);
  return <div className="archive-person-record space-y-5">
    <header className="archive-person-print-title"><h1 className="text-2xl font-bold">{employee.name}</h1><p className="mt-1 text-sm">{record.organization?.name ?? organizationName ?? ''} · Darbuotojo archyvo įrašas</p></header>
    <dl className="grid gap-3 border-b border-slate-100 pb-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
      ['Darbo sutarties Nr.', employee.contractNumber || 'Nenurodyta'],
      ['Pareigos', employee.position || 'Darbuotojas'],
      ['El. paštas', employee.email || 'Nenurodytas'],
      ['Įmonė', record.organization?.name ?? organizationName ?? 'Nenurodyta'],
      ['Archyvuota', new Date(record.archivedAt).toLocaleString('lt-LT')],
      ['Medicininis pažymėjimas iki', employee.medicalCertificateValidUntil || 'Nenurodyta'],
      ['AAP dydžiai', sizes.join(', ') || 'Nenurodyti'],
    ].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>)}</dl>
    <div className="border-b border-slate-100 pb-4"><h3 className="mb-2 text-sm font-semibold">Dokumentai archyvavimo metu</h3>{record.resources.length ? <ul className="space-y-1">{record.resources.map((resource) => <li className="text-sm text-slate-700" key={resource.id}>{resource.title} · {resource.type}</li>)}</ul> : <p className="text-sm text-slate-500">Priskirtų dokumentų nėra.</p>}</div>
    <div><h3 className="mb-2 text-sm font-semibold">Visi užfiksuoti parašai</h3><SignatureTable signatures={record.signatures} resources={record.resources} /></div>
  </div>;
}
function recordSignaturesLabel(count) { return `${count} ${count === 1 ? 'parašas' : count > 1 && count < 10 ? 'parašai' : 'parašų'}`; }
function PageTitle({ title, subtitle }) { return <div><h1 className="text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>; }
function Panel({ title, children }) {
  if (title === 'AAP išdavimo kortelės pozicijos') {
    return <dialog id="aap-settings" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-950/60">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">AAP pozicijos ir jų išdavimo sąlygos.</p></div>
        <button type="button" aria-label="Uždaryti nustatymus" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => document.getElementById('aap-settings')?.close()}><X size={20} /></button>
      </div>
      {children}
    </dialog>;
  }
  return <section className="rounded-lg border border-slate-200 bg-white p-5">{title ? <h2 className="mb-4 font-bold">{title}</h2> : null}{children}</section>;
}
function Metric({ label, value, accent = 'slate', hint }) {
  const accents = {
    blue: 'border-l-blue-500',
    green: 'border-l-emerald-500',
    amber: 'border-l-amber-500',
    rose: 'border-l-rose-500',
    slate: 'border-l-slate-400',
  };
  return <div className={`workspace-metric rounded-lg border border-slate-200 border-l-4 bg-white p-5 shadow-xs ${accents[accent] ?? accents.slate}`}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>{hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div>;
}
function DataTable({ headers, rows, empty = 'Duomenų dar nėra.' }) { return <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">{headers.map((header) => <th className="px-3 py-2 font-semibold" key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr className="border-b border-slate-100 last:border-0" key={index}>{row.map((cell, cellIndex) => <td className="px-3 py-3 align-top" key={cellIndex}>{cell}</td>)}</tr>) : <tr><td className="px-3 py-5 text-slate-500" colSpan={headers.length}>{empty}</td></tr>}</tbody></table></div>; }
function SignatureTable({ signatures, resources, archivedEmployees = [] }) {
  return <DataTable headers={['Darbo sutarties Nr.', 'Dokumentas', 'Pasirašė', 'Parašas', 'Patvirtinimas', 'Data', 'Galioja iki', 'IP adresas']} rows={signatures.map((signature) => [
    signature.contractNumber || 'Nenurodytas',
    resources.find((resource) => resource.id === signature.resourceId)?.title ?? archivedEmployees.flatMap((record) => record.resources).find((resource) => resource.id === signature.resourceId)?.title ?? 'Dokumentas',
    `${signature.signer} · ${signature.role}`,
    <SignatureImagePreview key={signature.id} signature={signature} emptyLabel="Nėra" />,
    signature.signatureMethod === 'PIN' ? 'PIN kodu' : signature.signatureMethod ?? 'PIN kodu',
    new Date(signature.signedAt).toLocaleString('lt-LT'),
    signature.validUntil ? new Date(signature.validUntil).toLocaleDateString('lt-LT') : 'Nenustatyta',
    signature.ip,
  ])} empty="Parašų dar nėra." />;
}
function SignatureImagePreview({ signature, emptyLabel = null }) {
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const signaturePath = signature.signaturePath ?? signature.consentSignaturePath;
  const available = Boolean(signature.signatureImage || signaturePath);

  const openSignatureImage = async () => {
    if (imageUrl || loading || !available) return;
    if (signature.signatureImage) {
      setImageUrl(signature.signatureImage);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [hydratedSignature] = await hydrateSignatureImages([{ ...signature, signaturePath }]);
      if (!hydratedSignature?.signatureImage) throw new Error('Parašo vaizdas nerastas.');
      setImageUrl(hydratedSignature.signatureImage);
    } catch (loadError) {
      setError(`Parašo vaizdo įkelti nepavyko: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!available) return emptyLabel ? <span className="text-slate-500">{emptyLabel}</span> : null;
  return <div className="min-w-32">
    {imageUrl
      ? <div className="space-y-1"><img className="h-12 w-32 rounded border border-slate-200 bg-white object-contain" src={imageUrl} alt={`${signature.signer} parašas`} /><button type="button" className="text-xs font-semibold text-emerald-800 hover:underline" onClick={() => setImageUrl('')}>Uždaryti</button></div>
      : <button type="button" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50" disabled={loading} onClick={openSignatureImage}>{loading ? 'Įkeliama…' : 'Peržiūrėti parašą'}</button>}
    {error && <p role="alert" className="mt-1 max-w-48 text-xs text-rose-700">{error}</p>}
  </div>;
}
function PaginatedSignatureHistory({ organizationId, employeeId, signerUserId, signatures, resources, employees, archivedEmployees = [], cloudMode }) {
  const [page, setPage] = useState(1);
  const [historyResult, setHistoryResult] = useState({ key: '', records: [], totalCount: 0, error: '' });
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const localRecords = useMemo(() => [...signatures].sort((left, right) => {
    const timeDifference = new Date(right.signedAt).getTime() - new Date(left.signedAt).getTime();
    return timeDifference || String(right.id).localeCompare(String(left.id));
  }), [signatures]);
  const localPageCount = Math.max(1, Math.ceil(localRecords.length / signatureHistoryPageSize));
  const requestKey = JSON.stringify([organizationId, employeeId, signerUserId, page]);
  const resultIsCurrent = historyResult.key === requestKey;
  const cloudCount = resultIsCurrent ? historyResult.totalCount : 0;
  const loading = cloudMode && Boolean(organizationId) && !resultIsCurrent;
  const pageCount = cloudMode ? Math.max(1, Math.ceil(cloudCount / signatureHistoryPageSize)) : localPageCount;
  const visibleRecords = cloudMode ? organizationId && resultIsCurrent ? historyResult.records : [] : localRecords.slice((page - 1) * signatureHistoryPageSize, page * signatureHistoryPageSize);
  const visibleCount = cloudMode ? organizationId ? cloudCount : 0 : localRecords.length;
  const visibleError = cloudMode && !organizationId
    ? 'Parašų istorijos įmonė nepasirinkta.'
    : resultIsCurrent ? historyResult.error : '';

  useEffect(() => {
    if (!cloudMode || !organizationId) return undefined;

    let active = true;
    const from = (page - 1) * signatureHistoryPageSize;
    let query = supabase
      .from('document_signatures')
      .select('signature_id, organization_id, employee_id, document_id, signer_user_id, signer_name, signer_role, signature_method, signed_at, valid_until, ip_address, metadata', { count: 'exact' })
      .eq('organization_id', organizationId);
    if (employeeId) query = query.eq('employee_id', employeeId);
    if (signerUserId) query = query.eq('signer_user_id', signerUserId);
    query
      .order('signed_at', { ascending: false })
      .order('signature_id', { ascending: false })
      .range(from, from + signatureHistoryPageSize - 1)
      .then(async ({ data: rows, count, error: queryError }) => {
        if (queryError) throw queryError;
        const resultCount = count ?? 0;
        const resultPageCount = Math.max(1, Math.ceil(resultCount / signatureHistoryPageSize));
        if (page > resultPageCount) {
          if (active) {
            setHistoryResult({ key: requestKey, records: [], totalCount: resultCount, error: '' });
            setPage(resultPageCount);
          }
          return;
        }
        const signaturesForPage = (rows ?? []).map((row) => ({
          id: row.signature_id,
          orgId: row.organization_id,
          employeeId: row.employee_id,
          resourceId: row.document_id,
          signer: row.signer_name,
          role: row.signer_role,
          signatureMethod: row.signature_method,
          signedAt: row.signed_at,
          validUntil: row.valid_until,
          ip: row.ip_address,
          signaturePath: row.metadata?.signaturePath,
          contractNumber: employeeById.get(row.employee_id)?.contractNumber ?? '',
        }));
        if (!active) return;
        setHistoryResult({ key: requestKey, records: signaturesForPage, totalCount: resultCount, error: '' });
      })
      .catch((queryError) => {
        if (!active) return;
        setHistoryResult({ key: requestKey, records: [], totalCount: 0, error: `Parašų istorijos įkelti nepavyko: ${queryError.message}` });
      });
    return () => { active = false; };
  }, [cloudMode, employeeById, employeeId, organizationId, page, requestKey, signerUserId]);

  return <div className="space-y-3">
    {visibleError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{visibleError}</p>}
    {loading && <p role="status" className="text-sm text-slate-500">Įkeliama parašų istorija…</p>}
    {!loading && !visibleError && <SignatureTable signatures={visibleRecords} resources={resources} archivedEmployees={archivedEmployees} />}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">{visibleCount ? `Rodoma ${(page - 1) * signatureHistoryPageSize + 1}–${Math.min(page * signatureHistoryPageSize, visibleCount)} iš ${visibleCount} parašų` : 'Parašų dar nėra.'}</p>
      <div className="flex gap-2">
        <button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Ankstesnis</button>
        <span className="self-center text-xs text-slate-500">{page} / {pageCount}</span>
        <button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50" disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>Kitas</button>
      </div>
    </div>
  </div>;
}
function getResourceWorkflowStatus(employee, resource, signatures, organizations, now, specialists = []) {
  if (!employee || !resource) return { key: 'todo', label: 'Nepradėta' };
  const workerSignature = signatures.filter((signature) => signature.employeeId === employee.id && signature.resourceId === resource.id && signature.role === 'Darbuotojas').sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
  if (workerSignature) {
    if (workerSignature.validUntil && new Date(workerSignature.validUntil).getTime() < now) return { key: 'expired', label: 'Galiojimas pasibaigė' };
    const org = organizations.find((item) => item.id === employee.orgId);
    const missingSigners = getRequiredSignerEntries(employee, resource, org, signatures, now, specialists).filter((signer) => signer.status !== 'signed');
    if (missingSigners.some((signer) => signer.role === 'DSS specialistas')) return { key: 'awaitingDss', label: 'Laukia DSS parašo' };
    if (missingSigners.some((signer) => signer.role === 'Vadovas')) return { key: 'awaitingEmployer', label: 'Laukia darbdavio parašo' };
    if (missingSigners.some((signer) => signer.role === 'Komisijos narys')) return { key: 'awaitingCommission', label: 'Laukia komisijos parašo' };
    if (missingSigners.length) return { key: 'awaitingSignatures', label: 'Laukia parašų' };
    return { key: 'signed', label: pinSignedStatusLabel };
  }
  if (employee.progressByResource?.[resource.id] === 'completed') return { key: 'unsigned', label: 'Užbaigta, nepasirašyta' };
  if (employee.progressByResource?.[resource.id] === 'started') return { key: 'started', label: 'Pradėta' };
  return { key: 'todo', label: 'Nepradėta' };
}
function getRequiredSigners(resource, org, employee) {
  const assignedRoles = Array.isArray(employee?.requiredSignersByResource?.[resource?.id])
    ? employee.requiredSignersByResource[resource.id]
    : Array.isArray(resource.requiredSigners)
      ? resource.requiredSigners
      : ['Žurnalas', 'Kortelė'].includes(resource.type) && org?.dss?.length
        ? ['DSS specialistas']
        : [];
  return [...new Set(['Darbuotojas', ...assignedRoles])];
}
function getRequiredSignerEntries(employee, resource, org, signatures, now, specialists = []) {
  const resourceSignatures = signatures.filter((signature) => signature.employeeId === employee.id && signature.resourceId === resource.id);
  const workerSignature = resourceSignatures.filter((signature) => signature.role === 'Darbuotojas').sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
  const signedAfterWorker = workerSignature ? resourceSignatures.filter((signature) => signature.role !== 'Darbuotojas' && new Date(signature.signedAt) >= new Date(workerSignature.signedAt) && (!signature.validUntil || new Date(signature.validUntil).getTime() >= now)) : [];
  const signerForRole = (role, name) => signedAfterWorker.find((signature) => signature.role === role && (!name || signature.signer === name));

  return getRequiredSigners(resource, org, employee).flatMap((role) => {
    if (role === 'Darbuotojas') {
      const expired = workerSignature?.validUntil && new Date(workerSignature.validUntil).getTime() < now;
      return [{ role, name: employee.name, signedBy: workerSignature?.signer, signedAt: workerSignature?.signedAt, status: workerSignature ? expired ? 'expired' : 'signed' : 'missing' }];
    }
    if (role === 'Vadovas') {
      const signature = signerForRole(role);
      return [{ role, name: signature?.signer ?? org?.manager ?? 'Įmonės vadovas', signedBy: signature?.signer, signedAt: signature?.signedAt, status: signature ? 'signed' : 'missing' }];
    }
    if (role === 'DSS specialistas') {
      const signature = signerForRole(role);
      const assignedSpecialists = (org?.dss ?? []).map((id) => specialists.find((specialist) => specialist.id === id)?.name).filter(Boolean);
      return [{ role, name: signature?.signer ?? (assignedSpecialists.join(', ') || 'Nepriskirtas DSS specialistas'), signedBy: signature?.signer, signedAt: signature?.signedAt, status: signature ? 'signed' : 'missing' }];
    }
    if (role === 'Komisijos narys' || role === 'Komisijos nariai') {
      const members = org?.commission ?? [];
      if (!members.length) return [{ role: 'Komisijos narys', name: 'Komisijos nariai nepriskirti', status: 'missing' }];
      return members.map((name) => {
        const signature = signerForRole('Komisijos narys', name);
        return { role: 'Komisijos narys', name, signedBy: signature?.signer, signedAt: signature?.signedAt, status: signature ? 'signed' : 'missing' };
      });
    }
    const signature = signerForRole(role);
    return [{ role, name: signature?.signer ?? role, signedBy: signature?.signer, signedAt: signature?.signedAt, status: signature ? 'signed' : 'missing' }];
  });
}
function createAapSnapshot(employee, org) {
  if (!employee || !org) return null;
  return {
    companyName: org.name,
    companyCode: org.companyCode,
    employeeId: employee.id,
    employeeName: employee.name,
    contractNumber: employee.contractNumber ?? '',
    department: employee.department ?? '',
    position: employee.position || 'Darbuotojas',
    sizes: { ...employee.sizes },
    items: (org.aapItems ?? defaultAapItems).map((item) => ({ ...item })),
  };
}
function signatureImageHtml(signature) {
  if (!signature?.signatureImage) return '';
  return `<img class="signature-image" src="${escapeHtml(signature.signatureImage)}" alt="${escapeHtml(signature.signer ?? 'Pasirašiusio asmens')} parašas">`;
}
function appendSignatureAudit(html, resource, employee, org, signatures, specialists) {
  const employees = Array.isArray(resource.previewEmployees) ? resource.previewEmployees : employee ? [employee] : [];
  if (!employees.length) return html;
  const signers = employees.flatMap((person) => getRequiredSignerEntries(person, resource, org, signatures, Date.now(), specialists).map((signer) => ({ employee: person, signer })));
  if (!signers.length) return html;

  const dateFormatter = new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFormatter = new Intl.DateTimeFormat('lt-LT', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const rows = signers.map(({ employee: person, signer }) => {
    const signature = signer.signedAt && signatures.find((item) => item.employeeId === person.id && item.resourceId === resource.id && item.role === signer.role && item.signer === signer.signedBy && item.signedAt === signer.signedAt);
    const signedAt = signature ? new Date(signature.signedAt) : null;
    const validDate = signedAt && !Number.isNaN(signedAt.getTime());
    const status = signer.status === 'signed' ? pinSignedStatusLabel : signer.status === 'expired' ? 'Galiojimas pasibaigė' : 'Laukia parašo';
    return `<tr><td>${escapeHtml(person.name)} · ${escapeHtml(person.contractNumber ?? '')}</td><td>${escapeHtml(signer.role)}</td><td>${escapeHtml(signer.signedBy ?? signer.name)}</td><td>${signatureImageHtml(signature)}</td><td>${validDate ? dateFormatter.format(signedAt) : ''}</td><td>${validDate ? timeFormatter.format(signedAt) : ''}</td><td>${escapeHtml(signature?.ip ?? '')}</td><td>${status}</td></tr>`;
  }).join('');
  const auditMarkup = `<section class="signature-audit"><h2>Parašų registras</h2><table><thead><tr><th>Darbuotojas / sutarties Nr.</th><th>Rolė</th><th>Pasirašantis asmuo</th><th>Parašas</th><th>Data</th><th>Tikslus laikas</th><th>IP adresas / aplinka</th><th>Būsena</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const style = parsed.createElement('style');
  style.textContent = '.signature-audit{break-inside:avoid;page-break-inside:avoid;margin:18px 0 0;padding-top:10px;border-top:1px solid #94a3b8;color:#0f172a;font:10px/1.35 Arial,sans-serif}.signature-audit h2{margin:0 0 6px;font-size:12px}.signature-audit table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}.signature-audit th,.signature-audit td{border:1px solid #94a3b8;padding:4px;text-align:left;overflow-wrap:anywhere}.signature-audit th{background:#f1f5f9}.signature-image{display:block;width:96px;height:30px;object-fit:contain}';
  parsed.head.append(style);
  const pageContainers = [...parsed.querySelectorAll('.journal-page, .card-container')];
  (pageContainers.at(-1) ?? parsed.body).insertAdjacentHTML('beforeend', auditMarkup);
  return `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
}
function populateJournalRows(html, resource, employee, org, signatures, specialists, allResources = []) {
  const supportedKinds = ['familiarization-card', 'workplace-dss-journal', 'intro-dss-journal', 'work-rules-journal', 'fire-safety-journal', 'knowledge-assessment-protocol', 'job-description-journal', 'internal-documents-register', 'chemical-safety-instruction-card'];
  if (!supportedKinds.includes(resource.templateKind)) return appendSignatureAudit(html, resource, employee, org, signatures, specialists);

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const table = resource.templateKind === 'familiarization-card' ? parsed.querySelector('.card-container table') : resource.templateKind === 'knowledge-assessment-protocol' ? parsed.querySelector('.protocol-table') : resource.templateKind === 'chemical-safety-instruction-card' ? parsed.querySelector('.card-page .card-table') : parsed.querySelector('.journal-page .journal-table');
  let rows = [...(table?.tBodies[0]?.rows ?? [])];
  const assignedEmployees = Array.isArray(resource.previewEmployees) ? resource.previewEmployees : employee ? [employee] : [];
  const employees = resource.defaultSettings?.populateEmployees === false ? [] : assignedEmployees;
  const configuredRowCount = Number(resource.defaultSettings?.rowCount) || rows.length;
  const rowCount = Math.max(configuredRowCount, employees.length);
  if (table?.tBodies[0] && rows[0]) {
    while (rows.length > rowCount) table.tBodies[0].deleteRow(rows.length - 1);
    while (rows.length < rowCount) table.tBodies[0].append(rows[0].cloneNode(true));
    rows = [...table.tBodies[0].rows];
  }
  if (['familiarization-card', 'work-rules-journal', 'knowledge-assessment-protocol', 'job-description-journal', 'chemical-safety-instruction-card'].includes(resource.templateKind)) {
    rows.forEach((row, index) => {
      if (row.cells[0]) row.cells[0].textContent = String(index + 1);
    });
  }
  const dateFormatter = new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeFormatter = new Intl.DateTimeFormat('lt-LT', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const formatDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? dateFormatter.format(date) : '';
  };
  const findSignature = (item, role, signer) => signatures
    .filter((signature) => signature.employeeId === item.id && signature.resourceId === resource.id && signature.role === role && (!signer || signature.signer === signer))
    .sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
  const entriesFor = (item) => getRequiredSignerEntries(item, resource, org, signatures, Date.now(), specialists);
  const proof = (item, entry) => {
    if (!entry) return '';
    const signature = findSignature(item, entry.role, entry.signedBy);
    const name = signature?.signer ?? entry.name;
    if (!signature) return `<span class="signature-pending">${escapeHtml(name)}<br>Laukia parašo</span>`;
    const signedAt = new Date(signature.signedAt);
    const dateTime = Number.isNaN(signedAt.getTime()) ? '' : `${dateFormatter.format(signedAt)} ${timeFormatter.format(signedAt)}`;
    const status = entry.status === 'expired' ? 'Galiojimas pasibaigė' : pinSignedStatusLabel;
    return `<span class="signature-proof"><strong>${escapeHtml(name)}</strong>${signatureImageHtml(signature)}<small>${status} · ${escapeHtml(dateTime)}</small><small>IP / aplinka: ${escapeHtml(signature.ip ?? '127.0.0.1 (demo)')}</small></span>`;
  };
  const writeRow = (row, values) => [...row.cells].forEach((cell, index) => { cell.innerHTML = values[index] ?? ''; });
  const nameFor = (entry) => entry ? escapeHtml(entry.signedBy ?? entry.name) : '';
  const otherEntries = (entries) => entries.filter((entry) => entry.role !== 'Darbuotojas');
  const style = parsed.createElement('style');
  style.textContent = '.signature-proof,.signature-pending{display:block;font-size:7.5px;line-height:1.2;overflow-wrap:anywhere}.signature-proof strong,.signature-proof small{display:block}.signature-image{display:block;width:96px;height:30px;object-fit:contain;margin:2px 0}.signature-pending{color:#92400e;font-style:italic}';
  parsed.head.append(style);

  if (resource.templateKind === 'fire-safety-journal') {
    const row = rows[0];
    if (row) {
      const settings = resource.defaultSettings ?? {};
      const signature = signatures.filter((item) => item.resourceId === resource.id && item.role === 'DSS specialistas').sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
      const signerName = specialists.find((person) => org?.dss?.includes(person.id))?.name ?? 'DSS specialistas';
      const approval = signature
        ? `<span class="signature-proof"><strong>${escapeHtml(signature.signer)}</strong>${signatureImageHtml(signature)}<small>${pinSignedStatusLabel} · ${escapeHtml(formatDate(signature.signedAt))} ${escapeHtml(timeFormatter.format(new Date(signature.signedAt)))}</small><small>IP / aplinka: ${escapeHtml(signature.ip ?? '127.0.0.1 (demo)')}</small></span>`
        : `<span class="signature-pending">${escapeHtml(signerName)}<br>Laukia parašo</span>`;
      writeRow(row, [settings.instructionNumber, settings.instructionTitle || resource.title, formatDate(signature?.signedAt || settings.date), `${escapeHtml(settings.instructorPosition || 'DSS specialistas')}<br>${escapeHtml(signature?.signer ?? signerName)}`, settings.changedInstruction].map((value) => value ?? ''));
      row.cells[3].innerHTML = `${escapeHtml(settings.instructorPosition || 'DSS specialistas')}<br>${signature ? escapeHtml(signature.signer) : escapeHtml(signerName)}<br>${approval}`;
    }
  } else {
    employees.slice(0, rows.length).forEach((item, index) => {
      const row = rows[index];
      const entries = entriesFor(item);
      const worker = entries.find((entry) => entry.role === 'Darbuotojas');
      const instructors = otherEntries(entries);
      const instructorNames = instructors.map(nameFor).join('<br>');
      const instructorProofs = instructors.map((entry) => proof(item, entry)).join('');
      const workerProof = proof(item, worker);
      const workerDate = formatDate(worker?.signedAt);

      if (resource.templateKind === 'familiarization-card') {
        writeRow(row, [String(index + 1), workerDate, escapeHtml(item.name), escapeHtml(item.position || 'Darbuotojas'), workerProof, instructorNames, instructorProofs]);
      } else if (resource.templateKind === 'work-rules-journal') {
        writeRow(row, [String(index + 1), escapeHtml(item.name), escapeHtml(item.position || 'Darbuotojas'), workerDate, workerProof]);
      } else if (resource.templateKind === 'intro-dss-journal') {
        writeRow(row, [workerDate, escapeHtml(item.name), escapeHtml(item.position || 'Darbuotojas'), instructorNames, instructors.map((entry) => escapeHtml(entry.role)).join('<br>'), workerProof, instructorProofs]);
      } else if (resource.templateKind === 'workplace-dss-journal') {
        const settings = resource.defaultSettings ?? {};
        const manager = entries.find((entry) => entry.role === 'Vadovas');
        writeRow(row, [workerDate, escapeHtml(item.name), escapeHtml(item.position || 'Darbuotojas'), escapeHtml(settings.instructionNumber ?? ''), escapeHtml(settings.instructionTitle || resource.title), instructors.map((entry) => `${escapeHtml(entry.role)} · ${nameFor(entry)}`).join('<br>'), instructorProofs, workerProof, proof(item, manager)]);
      } else if (resource.templateKind === 'job-description-journal') {
        const settings = resource.defaultSettings ?? {};
        writeRow(row, [String(index + 1), escapeHtml(item.name), escapeHtml(item.position || 'Darbuotojas'), escapeHtml(settings.regulationNumber ?? ''), workerDate, workerProof]);
      } else if (resource.templateKind === 'internal-documents-register') {
        const findRelatedResource = (id, pattern) => allResources.find((candidate) => candidate.id === id)
          ?? allResources.find((candidate) => candidate.id !== resource.id && pattern.test(`${candidate.title} ${candidate.category}`));
        const related = [
          findRelatedResource('res-intro-dss-journal', /įvadin.*(dss|saug|instruktav)|dss.*įvadin/i),
          findRelatedResource('res-fire-safety-journal', /gaisrin/i),
          findRelatedResource('res-work-rules-journal', /darbo tvarkos taisykl/i),
          findRelatedResource('res-job-description-journal', /pareigin.*nuostat/i),
          findRelatedResource('res-professional-risk-journal', /profesin.*rizik|rizikos vertinim|\bprv\b/i),
          findRelatedResource('res-safety-data-sheets', /saugos duomenų lap|\bsdl\b/i),
        ];
        const relatedSignature = (linkedResource, role) => linkedResource && signatures
          .filter((signature) => signature.employeeId === item.id && signature.resourceId === linkedResource.id && signature.role === role)
          .sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
        const relatedProof = (linkedResource, signature) => {
          if (!linkedResource) return '';
          if (!signature) return item.resourceIds?.includes(linkedResource.id) ? '<span class="signature-pending">Laukia parašo</span>' : '';
          const date = formatDate(signature.signedAt);
          const time = new Date(signature.signedAt);
          const timeText = Number.isNaN(time.getTime()) ? '' : timeFormatter.format(time);
          return `<span class="signature-proof"><strong>${escapeHtml(signature.signer)}</strong>${signatureImageHtml(signature)}<small>${pinSignedStatusLabel} · ${escapeHtml(date)} ${escapeHtml(timeText)}</small><small>IP / aplinka: ${escapeHtml(signature.ip ?? '127.0.0.1 (demo)')}</small></span>`;
        };
        const [dssResource, fireResource, rulesResource, positionResource, riskResource, sdsResource] = related;
        const dssWorker = relatedSignature(dssResource, 'Darbuotojas');
        const dssInstructor = relatedSignature(dssResource, 'DSS specialistas');
        const fireWorker = relatedSignature(fireResource, 'Darbuotojas');
        const fireInstructor = relatedSignature(fireResource, 'DSS specialistas');
        const rulesWorker = relatedSignature(rulesResource, 'Darbuotojas');
        const positionWorker = relatedSignature(positionResource, 'Darbuotojas');
        const riskWorker = relatedSignature(riskResource, 'Darbuotojas');
        const sdsWorker = relatedSignature(sdsResource, 'Darbuotojas');
        const settingFor = (linkedResource, ...keys) => {
          const settings = { ...linkedResource?.defaultSettings, ...org?.resourceSettings?.[linkedResource?.id] };
          return keys.map((key) => settings[key]).find(Boolean) ?? '';
        };
        writeRow(row, [
          escapeHtml(item.name),
          escapeHtml(item.position || 'Darbuotojas'),
          formatDate(dssWorker?.signedAt ?? dssInstructor?.signedAt),
          relatedProof(dssResource, dssInstructor, 'DSS specialistas'),
          relatedProof(dssResource, dssWorker, 'Darbuotojas'),
          formatDate(fireWorker?.signedAt ?? fireInstructor?.signedAt),
          relatedProof(fireResource, fireInstructor, 'DSS specialistas'),
          relatedProof(fireResource, fireWorker, 'Darbuotojas'),
          formatDate(rulesWorker?.signedAt),
          relatedProof(rulesResource, rulesWorker, 'Darbuotojas'),
          formatDate(positionWorker?.signedAt),
          escapeHtml(settingFor(positionResource, 'regulationNumber')),
          relatedProof(positionResource, positionWorker, 'Darbuotojas'),
          formatDate(riskWorker?.signedAt),
          escapeHtml(settingFor(riskResource, 'riskAssessmentNumber', 'cardNumber', 'documentNumber')),
          relatedProof(riskResource, riskWorker, 'Darbuotojas'),
          formatDate(sdsWorker?.signedAt),
          escapeHtml(settingFor(sdsResource, 'safetyDataSheetNumber', 'documentNumber')),
          relatedProof(sdsResource, sdsWorker, 'Darbuotojas'),
        ]);
      } else if (resource.templateKind === 'knowledge-assessment-protocol') {
        const result = (item.testResults ?? [])
          .filter((testResult) => testResult.resourceId === resource.relatedTestId)
          .sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt))[0];
        const decision = result ? `${result.passed ? 'Išlaikė' : 'Neišlaikė'} · ${result.score}%` : resource.relatedTestId ? 'Testo rezultato nėra' : '';
        writeRow(row, [String(index + 1), escapeHtml(item.name), escapeHtml(item.position || 'Darbuotojas'), escapeHtml(decision), workerProof]);
      } else if (resource.templateKind === 'chemical-safety-instruction-card') {
        const testResult = (item.testResults ?? [])
          .filter((result) => result.resourceId === resource.relatedTestId)
          .sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt))[0];
        const latestSignature = (resourceId, role) => signatures
          .filter((signature) => signature.employeeId === item.id && signature.resourceId === resourceId && signature.role === role)
          .sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
        const workerSignature = latestSignature(resource.id, 'Darbuotojas') ?? latestSignature(resource.relatedTestId, 'Darbuotojas');
        const instructorSignature = latestSignature(resource.id, 'DSS specialistas') ?? latestSignature(resource.relatedTestId, 'DSS specialistas');
        const assignedInstructor = specialists.find((person) => org?.dss?.includes(person.id))?.name ?? 'DSS specialistas';
        const instructorName = instructorSignature?.signer ?? assignedInstructor;
        const cardProof = (signature, signerName, pending) => {
          if (!signature) return pending ? `<span class="signature-pending">${escapeHtml(signerName)}<br>Laukia parašo</span>` : '';
          const signedAt = new Date(signature.signedAt);
          const timeText = Number.isNaN(signedAt.getTime()) ? '' : timeFormatter.format(signedAt);
          return `<span class="signature-proof"><strong>${escapeHtml(signature.signer)}</strong>${signatureImageHtml(signature)}<small>${pinSignedStatusLabel} · ${escapeHtml(formatDate(signature.signedAt))} ${escapeHtml(timeText)}</small><small>IP / aplinka: ${escapeHtml(signature.ip ?? '127.0.0.1 (demo)')}</small></span>`;
        };
        const hasCardAssignment = item.resourceIds?.includes(resource.id);
        const instructionDate = workerSignature?.signedAt ?? testResult?.completedAt;
        writeRow(row, [
          String(index + 1),
          formatDate(instructionDate),
          escapeHtml(item.name),
          escapeHtml(item.position || 'Darbuotojas'),
          cardProof(workerSignature, item.name, hasCardAssignment),
          escapeHtml(instructorName),
          cardProof(instructorSignature, instructorName, hasCardAssignment && Boolean(org?.dss?.length)),
        ]);
      }
    });
  }

  if (resource.templateKind === 'knowledge-assessment-protocol') {
    const assignments = (resource.previewCommissionAssignments ?? [])
      .filter((assignment) => assignment.status === 'accepted'
        && (!resource.protocolBatchDate || (assignment.respondedAt && new Date(assignment.respondedAt).toISOString().slice(0, 10) <= resource.protocolBatchDate)))
      .sort((left, right) => (left.role === 'Komisijos pirmininkas' ? -1 : 1) - (right.role === 'Komisijos pirmininkas' ? -1 : 1));
    const batchSignatures = (resource.previewProtocolCommissionSignatures ?? [])
      .filter((signature) => signature.batchId === resource.protocolBatchId);
    const chair = assignments.find((assignment) => assignment.role === 'Komisijos pirmininkas');
    const members = assignments.filter((assignment) => assignment.role === 'Komisijos narys');
    const historicalSigners = batchSignatures
      .filter((signature) => !assignments.some((assignment) => assignment.id === signature.assignmentId))
      .map((signature) => ({ id: signature.assignmentId, employeeName: signature.signer, role: signature.role }));
    const chairSigners = [...(chair ? [chair] : []), ...historicalSigners.filter((signer) => signer.role === 'Komisijos pirmininkas')];
    const memberSigners = [...members, ...historicalSigners.filter((signer) => signer.role === 'Komisijos narys')];
    const commissionLines = parsed.querySelectorAll('.commission-row .line');
    if (commissionLines[0]) commissionLines[0].textContent = chair?.employeeName ?? '';
    if (commissionLines[1]) commissionLines[1].textContent = members.map((assignment) => assignment.employeeName).join(', ');
    if (commissionLines[2]) commissionLines[2].closest('.commission-row')?.remove();

    const signatureRows = parsed.querySelectorAll('.signatures-section .sig-row');
    const renderCommissionSignatures = (container, signers) => {
      if (!container) return;
      const content = container.querySelector('.sig-content');
      if (!content) return;
      content.replaceChildren();
      signers.forEach((assignment) => {
        const signature = batchSignatures.find((item) => item.assignmentId === assignment.id);
        const pair = parsed.createElement('div');
        pair.className = 'commission-signature-proof';
        const name = parsed.createElement('strong');
        name.textContent = assignment.employeeName;
        pair.append(name);
        if (signature?.signatureImage) {
          const image = parsed.createElement('img');
          image.src = signature.signatureImage;
          image.alt = `${assignment.employeeName} parašas`;
          image.className = 'signature-image';
          pair.append(image);
        } else {
          const pending = parsed.createElement('span');
          pending.textContent = 'Laukia parašo';
          pair.append(pending);
        }
        if (signature?.signedAt) {
          const audit = parsed.createElement('small');
          audit.textContent = `${formatDate(signature.signedAt)} · ${signature.ip ?? 'IP nenurodytas'}`;
          pair.append(audit);
        }
        content.append(pair);
      });
    };
    renderCommissionSignatures(signatureRows[0], chairSigners);
    renderCommissionSignatures(signatureRows[1], memberSigners);
    const style = parsed.createElement('style');
    style.textContent = '.commission-signature-proof{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:3px 0}.commission-signature-proof .signature-image{width:90px;height:30px;object-fit:contain}.commission-signature-proof small{font-size:8px;color:#64748b}';
    parsed.head.append(style);
  }

  return `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`;
}
function prepareResourcePrintHtml(html, title) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  let titleElement = parsed.head.querySelector('title');
  if (!titleElement) {
    titleElement = parsed.createElement('title');
    parsed.head.append(titleElement);
  }
  titleElement.textContent = title;

  const hasPageSettings = [...parsed.querySelectorAll('style')].some((style) => /@page\b/.test(style.textContent ?? ''));
  if (!hasPageSettings) {
    const printStyle = parsed.createElement('style');
    printStyle.textContent = '@page{size:A4 portrait;margin:12mm}@media print{body{margin:0;background:#fff}}';
    parsed.head.append(printStyle);
  }

  parsed.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('mobile-table-scroll')) return;
    const wrapper = parsed.createElement('div');
    wrapper.className = 'mobile-table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Lentelė; telefone slinkite į šoną, kad matytumėte visus stulpelius');
    table.before(wrapper);
    wrapper.append(table);
  });

  const responsivePreviewStyle = parsed.createElement('style');
  responsivePreviewStyle.textContent = `
    .mobile-table-scroll { width: 100%; }
    @media screen and (max-width: 640px) {
      body { max-width: 100%; overflow-x: hidden; }
      .mobile-table-scroll {
        max-width: 100%;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
      }
      .mobile-table-scroll::after {
        content: 'Lentelę slinkite į šoną';
        display: block;
        padding: 4px 0;
        color: #64748b;
        font: 10px/1.3 Arial, sans-serif;
      }
      .mobile-table-scroll table { width: 100%; table-layout: fixed; }
      .mobile-table-scroll .journal-table { min-width: 760px; }
      .mobile-table-scroll .protocol-table { min-width: 560px; }
      .mobile-table-scroll .card-table { min-width: 680px; }
      .mobile-table-scroll .signature-audit table { min-width: 900px; }
      .protocol-container, .card-page, .card-container, .journal-page {
        width: 100%;
        max-width: 100%;
        min-height: 0;
        margin-left: 0;
        margin-right: 0;
        padding: 12px;
      }
      .signature-grid { grid-template-columns: 1fr; gap: 12px; }
      .sig-row { gap: 8px; }
      .sig-title { width: 32%; flex: 0 0 32%; }
      .sig-pair { gap: 8px; }
      .mobile-table-scroll .signature-image {
        width: 100%;
        max-width: 96px;
        height: 26px;
        object-fit: contain;
      }
    }
    @media print {
      .mobile-table-scroll { width: auto; max-width: none; overflow: visible; }
      .mobile-table-scroll::after { display: none; }
    }
  `;
  parsed.head.append(responsivePreviewStyle);

  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

function buildResourcePreviewHtml(resource, employee, org, signatures, resources = []) {
  resources = resource.previewResources ?? resources;
  if (resource.id === 'res-aap' && resource.aapCatalogPreview) {
    const blankEmployee = { id: '', name: '', contractNumber: '', position: '', sizes: {} };
    return buildResourcePreviewHtml({ ...resource, templateOnly: false, aapCatalogPreview: false, previewEmployees: undefined }, blankEmployee, org, []);
  }
  if (resource.templateOnly) {
    employee = null;
    org = null;
    signatures = [];
  }
  if (resource.id === 'res-aap' && resource.templateOnly) {
    const blankEmployee = { id: 'template-preview', name: '', contractNumber: '', position: '', sizes: {} };
    const blankOrg = { name: '', companyCode: '', aapItems: [] };
    return buildResourcePreviewHtml({ ...resource, templateOnly: false, previewEmployees: undefined }, blankEmployee, blankOrg, []);
  }
  if (resource.id === 'res-aap' && !employee && Array.isArray(resource.previewEmployees) && resource.previewEmployees.length === 0) {
    return '<!DOCTYPE html><html lang="lt"><meta charset="UTF-8"><body><p>Šiam dokumentui įmonėje darbuotojų dar nepriskirta.</p></body></html>';
  }
  if (resource.id === 'res-aap' && resource.previewEmployees?.length > 1) {
    const singleResource = { ...resource, previewEmployees: [] };
    const firstDocument = new DOMParser().parseFromString(buildResourcePreviewHtml(singleResource, resource.previewEmployees[0], org, signatures), 'text/html');
    const paginationStyle = firstDocument.createElement('style');
    paginationStyle.textContent = '@media print{.employee-page-start{page-break-before:always;break-before:page}}';
    firstDocument.head.append(paginationStyle);
    resource.previewEmployees.slice(1).forEach((person) => {
      const personDocument = new DOMParser().parseFromString(buildResourcePreviewHtml(singleResource, person, org, signatures), 'text/html');
      const pages = [...personDocument.body.children];
      pages[0]?.classList.add('employee-page-start');
      pages.forEach((node) => firstDocument.body.append(node));
    });
    return `<!DOCTYPE html>\n${firstDocument.documentElement.outerHTML}`;
  }
  if (resource.type === 'Testas' && resource.questions?.length) return buildQuizPreviewHtml(resource);
  if (resource.id !== 'res-aap') {
    const values = {
      COMPANY_NAME: escapeHtml(org?.name ?? ''),
      COMPANY_CODE: escapeHtml(org?.companyCode ?? ''),
      PROTOCOL_TITLE: escapeHtml(resource.title ?? ''),
      PROTOCOL_DATE: escapeHtml(resource.protocolDateText ?? ''),
      PROTOCOL_NUMBER: escapeHtml(resource.protocolNumber ?? ''),
      LOCATION_PLACE: '',
    };
    const html = Object.entries(values).reduce((content, [key, value]) => content.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value), resource.html || '<p>Šis šablonas dar neturi turinio.</p>');
    return populateJournalRows(html, resource, employee, org, signatures, resource.previewSpecialists ?? [], resources);
  }
  const workerSignature = signatures.filter((item) => item.employeeId === employee?.id && item.resourceId === resource.id && item.role === 'Darbuotojas').sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
  const employerSignature = signatures.filter((item) => item.employeeId === employee?.id && item.resourceId === resource.id && item.role === 'Vadovas').sort((left, right) => new Date(right.signedAt) - new Date(left.signedAt))[0];
  const snapshot = workerSignature?.aapSnapshot ?? createAapSnapshot(employee, org);
  const documentEmployee = snapshot ? { ...employee, ...snapshot, name: snapshot.employeeName } : employee;
  const companyName = snapshot?.companyName ?? org?.name ?? '';
  const aapItems = snapshot?.items ?? org?.aapItems ?? defaultAapItems;
  const employeeParts = (documentEmployee?.name ?? '').trim().split(/\s+/).filter(Boolean);
  const employeeFirstName = employeeParts.shift() ?? '';
  const employeeLastName = employeeParts.join(' ');
  const today = new Date().toLocaleDateString('lt-LT');
  const formatDate = (value) => value ? new Date(value).toLocaleDateString('lt-LT') : '';
  const formatDateTime = (value) => value ? new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : '';
  const signatureDetails = (signature) => signature ? `Tikslus laikas: ${formatDateTime(signature.signedAt)} · IP adresas / aplinka: ${signature.ip ?? '127.0.0.1 (demo)'}` : 'Tikslus laikas: · IP adresas / aplinka:';
  const total = aapItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const makeRows = (issueSheet = false) => aapItems.map((item, index) => {
    const lineTotal = Number(item.quantity || 0) * Number(item.unitPrice || 0);
    return issueSheet
      ? `<tr><td>${index + 1}.</td><td></td><td class="text-left">${escapeHtml(item.name)}</td><td>${escapeHtml(item.unit)}</td><td>${escapeHtml(item.quantity)}</td><td>${formatAmount(item.unitPrice)}</td><td>${formatAmount(lineTotal)}</td></tr>`
      : `<tr><td>${index + 1}.</td><td class="text-left">${escapeHtml(item.name)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.unit)}</td><td class="text-left">${escapeHtml(item.validity)}</td></tr>`;
  }).join('');
  const values = {
    '{{COMPANY_NAME}}': escapeHtml(companyName),
    '{{CARD_NUMBER}}': escapeHtml(employee?.sequenceNumber ?? ''),
    '{{REGISTER_NUMBER}}': escapeHtml(`${org?.companyCode ?? 'AAP'}-${employee?.sequenceNumber ?? ''}`),
    '{{EMPLOYEE_FIRST_NAME}}': escapeHtml(employeeFirstName),
    '{{EMPLOYEE_LAST_NAME}}': escapeHtml(employeeLastName),
    '{{EMPLOYEE_NAME}}': escapeHtml(documentEmployee?.name ?? ''),
    '{{CONTRACT_NO}}': escapeHtml(documentEmployee?.contractNumber ?? ''),
    '{{DEPARTMENT}}': escapeHtml(documentEmployee?.department ?? ''),
    '{{POSITION}}': escapeHtml(documentEmployee?.position || 'Darbuotojas'),
    '{{HEIGHT}}': escapeHtml(documentEmployee?.sizes?.height ?? ''),
    '{{CLOTHING_SIZE}}': escapeHtml(documentEmployee?.sizes?.clothes ?? ''),
    '{{SHOE_SIZE}}': escapeHtml(documentEmployee?.sizes?.shoes ?? ''),
    '{{HEAD_SIZE}}': escapeHtml(documentEmployee?.sizes?.helmet ?? ''),
    '{{OTHER_SIZES}}': escapeHtml([documentEmployee?.sizes?.pants && `kelnių ${documentEmployee.sizes.pants}`, documentEmployee?.sizes?.jacket && `striukės ${documentEmployee.sizes.jacket}`].filter(Boolean).join(', ')),
    '{{EMPLOYER_NAME}}': escapeHtml(employerSignature?.signer ?? ''),
    '{{EMPLOYEE_DATE}}': `Data: ${formatDate(workerSignature?.signedAt)}`,
    '{{EMPLOYER_DATE}}': `Data: ${formatDate(employerSignature?.signedAt)}`,
    '{{EMPLOYEE_SIGNATURE_DETAILS}}': escapeHtml(signatureDetails(workerSignature)),
    '{{EMPLOYER_SIGNATURE_DETAILS}}': escapeHtml(signatureDetails(employerSignature)),
    '{{EMPLOYEE_SIGNATURE_IMAGE}}': signatureImageHtml(workerSignature),
    '{{EMPLOYER_SIGNATURE_IMAGE}}': signatureImageHtml(employerSignature),
    '{{DOCUMENT_DATE}}': today,
    '{{ISSUE_DATE}}': formatDate(workerSignature?.signedAt),
    '{{TOTAL_AMOUNT}}': `${formatAmount(total)} Eur`,
    '{{TOTAL_AMOUNT_WORDS}}': escapeHtml(amountInLithuanianWords(total)),
    '{{ACCOUNTING_ROWS}}': makeRows(),
    '{{ISSUE_ROWS}}': makeRows(true),
  };
  const html = Object.entries(values).reduce((content, [token, value]) => content.replaceAll(token, value), resource.html || '');
  if (!workerSignature?.signatureImage && !employerSignature?.signatureImage) return html;

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const insertSignatureImage = (label, signature) => {
    if (!signature?.signatureImage) return;
    const entry = [...parsed.querySelectorAll('.signature-entry')].find((item) => item.textContent?.includes(label));
    const line = entry?.querySelector('.sig-line');
    if (!entry || !line || entry.querySelector('.signature-image')) return;
    const image = parsed.createElement('img');
    image.className = 'signature-image';
    image.src = signature.signatureImage;
    image.alt = `${signature.signer} parašas`;
    line.before(image);
  };
  insertSignatureImage('Darbdavys ar jo įgaliotas asmuo', employerSignature);
  insertSignatureImage('Vieną egzempliorių gavau', workerSignature);
  const style = parsed.createElement('style');
  style.textContent = '.signature-image{display:block;width:150px;height:30px;object-fit:contain;object-position:left center}';
  parsed.head.append(style);
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}
function buildQuizPreviewHtml(resource) {
  const multipleAnswersAllowed = resource.questions.some((question) => Array.isArray(question.correctIndices) || question.multipleAnswers === true);
  const questionMarkup = resource.questions.map((question, index) => {
    const options = question.options.map((option) => `<li>${escapeHtml(option)}</li>`).join('');
    const instruction = Array.isArray(question.correctIndices) || question.multipleAnswers === true ? '<p class="multi-answer">Pažymėkite visus teisingus variantus.</p>' : '';
    return `<section class="question"><h2>${index + 1}. ${escapeHtml(question.prompt)}</h2>${instruction}<ol type="a">${options}</ol></section>`;
  }).join('');
  const answerInstructions = multipleAnswersAllowed ? 'Kai kuriuose klausimuose gali būti keli teisingi variantai.' : 'Kiekviename klausime yra vienas teisingas variantas.';
  return `<!doctype html><html lang="lt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(resource.title)}</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;color:#17202a;font:14px/1.5 Arial,sans-serif}.sheet{max-width:820px;margin:0 auto}.sheet h1{font-size:20px;text-align:center}.instructions{margin:16px 0 24px;padding:12px;border-left:3px solid #28736a;background:#f1f5f4}.question{margin:0 0 20px;break-inside:avoid}.question h2{font-size:14px;margin:0 0 8px}.question ol{margin:0;padding-left:28px}.question li{padding:2px 0}.multi-answer{margin:0 0 6px;color:#475569;font-size:12px;font-style:italic}</style></head><body><main class="sheet"><h1>${escapeHtml(resource.title)}</h1><p class="instructions">Atsakykite į visus ${resource.questions.length} klausimus. ${answerInstructions} Išlaikymui reikia surinkti bent 80 %.</p>${questionMarkup}</main></body></html>`;
}
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function buildAapIssuanceHtml(issuance, employee, org) {
  const rows = issuance.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.reason || '')}</td><td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td><td>${escapeHtml(item.validity || '')}</td></tr>`).join('');
  const signedAt = issuance.signedAt ? new Date(issuance.signedAt).toLocaleString('lt-LT') : '';
  return `<!doctype html><html lang="lt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AAP išdavimo patvirtinimas</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;color:#17202a;font:14px/1.5 Arial,sans-serif}.sheet{max-width:900px;margin:0 auto}h1{text-align:center;font-size:21px;margin:0 0 24px}.details{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:22px}.details p{margin:0}.details strong{display:inline-block;min-width:130px}table{width:100%;border-collapse:collapse;margin:14px 0 28px}th,td{border:1px solid #94a3b8;padding:8px;text-align:left;vertical-align:top}th{background:#f1f5f9}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:36px}.signatures section{border-top:1px solid #64748b;padding-top:8px}.signature-image{display:block;width:220px;height:80px;object-fit:contain;object-position:left center}.audit{font-size:12px;color:#475569;margin-top:16px}@media print{body{padding:0}.sheet{max-width:none}tr{break-inside:avoid}}</style></head><body><main class="sheet"><h1>AAP PRIEMONIŲ IŠDAVIMO PATVIRTINIMAS</h1><section class="details"><p><strong>Įmonė:</strong> ${escapeHtml(org.name)}</p><p><strong>Įmonės kodas:</strong> ${escapeHtml(org.companyCode || '')}</p><p><strong>Darbuotojas:</strong> ${escapeHtml(employee.name)}</p><p><strong>Pareigos:</strong> ${escapeHtml(employee.position || 'Darbuotojas')}</p><p><strong>Darbo sutarties Nr.:</strong> ${escapeHtml(employee.contractNumber || '')}</p><p><strong>Išdavimo data:</strong> ${escapeHtml(formatProtocolDate(issuance.issuedAt))}</p><p><strong>Išdavė:</strong> ${escapeHtml(issuance.issuedBy)}</p></section><table><thead><tr><th>Nr.</th><th>AAP priemonė</th><th>Išdavimo pagrindas</th><th>Kiekis</th><th>Tinkamumo terminas</th></tr></thead><tbody>${rows}</tbody></table><section class="signatures"><section><strong>Išdavimą patvirtino darbuotojas</strong>${signatureImageHtml(issuance)}<p>${escapeHtml(issuance.signer || employee.name)}</p></section><section><strong>Pasirašyta PIN kodu</strong><p>${escapeHtml(signedAt)}</p><p>IP: ${escapeHtml(issuance.ip || 'Nenurodytas')}</p></section></section><p class="audit">Įrašo Nr.: ${escapeHtml(issuance.id)} · Išdavė: ${escapeHtml(issuance.issuedBy)}</p></main></body></html>`;
}
function TestForm({ questions, answers, setAnswers, onSubmit }) {
  const [validationError, setValidationError] = useState('');
  const handleSubmit = (event) => {
    if (questions.some((question, index) => Array.isArray(question.correctIndices) || question.multipleAnswers === true ? !answers[index]?.length : answers[index] === undefined)) {
      event.preventDefault();
      setValidationError('Pažymėkite atsakymą kiekviename klausime.');
      return;
    }
    setValidationError('');
    onSubmit(event);
  };

  return <form className="space-y-4 rounded-lg bg-slate-50 p-4" onSubmit={handleSubmit}><div className="border-b border-slate-200 pb-3"><h3 className="font-semibold">Atsakykite į klausimus</h3><p className="mt-1 text-sm text-slate-600">Klausimuose gali būti vienas arba keli teisingi variantai. Išlaikymui reikia surinkti bent 80 %.</p></div>{questions.map((question, index) => { const multiple = Array.isArray(question.correctIndices) || question.multipleAnswers === true; return <fieldset className="space-y-2" key={`${question.prompt}-${index}`}><legend className="text-sm font-semibold">{index + 1}. {question.prompt}</legend>{multiple && <p className="text-xs font-medium text-slate-600">Pažymėkite visus teisingus variantus.</p>}{question.options.map((option, optionIndex) => <label className="flex items-start gap-2 text-sm" key={optionIndex}><input type={multiple ? 'checkbox' : 'radio'} name={`answer-${index}`} value={optionIndex} checked={multiple ? (answers[index] ?? []).includes(String(optionIndex)) : answers[index] === String(optionIndex)} onChange={(event) => setAnswers((current) => {
      if (!multiple) return { ...current, [index]: event.target.value };
      const selected = current[index] ?? [];
      return { ...current, [index]: event.target.checked ? [...new Set([...selected, event.target.value])] : selected.filter((answer) => answer !== event.target.value) };
    })} />{option}</label>)}</fieldset>; })}{validationError && <p role="alert" className="text-sm font-medium text-rose-700">{validationError}</p>}<button className={buttonClass}>Pateikti atsakymus</button></form>;
}

function LibraryFilters({ resources, resourceTypes = defaultResourceTypes, selectedType, onTypeChange, search, onSearchChange }) {
  const filterTypes = [
    { value: 'visos', label: 'Visi' },
    ...resourceTypes.map((type) => ({ value: type, label: resourceTypeDisplayNames[type] ?? type })),
  ];
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Bibliotekos turinio filtrai">
      {filterTypes.map(({ value, label }) => {
        const count = value === 'visos' ? resources.length : resources.filter((resource) => resource.type === value).length;
        const isSelected = selectedType === value;
        return <button key={value} type="button" aria-pressed={isSelected} onClick={() => onTypeChange(value)} className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${isSelected ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
          {label}<span className={`text-xs tabular-nums ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>{count}</span>
        </button>;
      })}
    </div>
    <label className="relative block w-full sm:max-w-xs">
      <span className="sr-only">Ieškoti bibliotekoje</span>
      <Search size={16} className="absolute left-3 top-3 text-slate-400" />
      <input type="search" className={`${inputClass} pl-9`} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Ieškoti pagal pavadinimą ar kategoriją" />
    </label>
  </div>;
}

function ReportTestCard({ resource, attemptCount, passedCount, onSelect }) {
  return <article className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
    {resource.image && <img src={resource.image} alt="" className="h-32 w-full object-cover" />}
    <div className="flex flex-1 flex-col gap-3 p-4"><div><p className="text-xs font-semibold text-emerald-800">{resource.category} · Testas</p><h3 className="mt-2 font-bold leading-snug">{resource.title}</h3></div><p className="text-xs text-slate-500">{attemptCount} bandymų · {passedCount} išlaikė</p><button type="button" className={`${buttonClass} mt-auto`} onClick={onSelect}><Eye size={15} />Peržiūrėti rezultatus<ChevronRight size={15} /></button></div>
  </article>;
}

function ReportResourceCard({ resource, employeeCount, signatureCount, onPreview, onDownload }) {
  return <article className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
    {resource.image ? <img src={resource.image} alt="" className="h-36 w-full object-cover" /> : <div className="grid h-36 place-items-center bg-slate-100 text-slate-500"><BookOpen size={28} /></div>}
    <div className="flex flex-1 flex-col gap-3 p-4"><div><p className="text-xs font-semibold text-emerald-800">{resource.category} · {resource.type}</p><h3 className="mt-2 font-bold leading-snug">{resource.title}</h3></div><p className="text-xs text-slate-500">{employeeCount} darbuotojų · {signatureCount} parašų įrašų</p><div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3"><button type="button" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50" onClick={onPreview}><Eye size={15} className="mr-1 inline" />Peržiūrėti</button><button type="button" className={buttonClass} onClick={onDownload}><Download size={15} />Atsisiųsti PDF</button></div></div>
  </article>;
}

function ProtocolSettingsDialog({ resource, settings, onChange, onSave, onClose }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><form onSubmit={onSave} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
    <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-800">Įmonės protokolo nustatymai</p><h2 className="mt-1 text-xl font-bold">{resource.title}</h2></div><button type="button" aria-label="Uždaryti nustatymus" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={onClose}><X size={20} /></button></div>
    <label className="block text-sm font-medium">Naują protokolą kurti<select className={`${inputClass} mt-1`} value={settings.protocolCadence ?? 'weekly-friday'} onChange={(event) => onChange({ ...settings, protocolCadence: event.target.value })}><option value="weekly-friday">Kas penktadienį (pirmadienis–penktadienis)</option><option value="weekly-sunday">Kas sekmadienį (pirmadienis–sekmadienis)</option><option value="until-full">Surinkus 15 darbuotojų</option></select></label>
    <p className="mt-2 text-sm text-slate-500">Darbuotojai grupuojami pagal pakvietimo datą. Tuščias periodas protokolo įrašo nesukuria. „Surinkus 15 darbuotojų“ režime data nustatoma, kai užsipildo paskutinė eilutė.</p>
    <label className="mt-4 block text-sm font-medium">Galiojimas (mėnesiais)<input className={`${inputClass} mt-1`} type="number" min="1" max="120" value={settings.validityMonths ?? resource.validityMonths ?? 12} onChange={(event) => onChange({ ...settings, validityMonths: event.target.value })} /></label>
    <fieldset className="mt-5 space-y-2 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">Kas turi pasirašyti</legend><div className="grid gap-2 sm:grid-cols-2">{signerRoleOptions.map(({ value, label }) => <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(settings.requiredSigners ?? resource.requiredSigners ?? ['Darbuotojas']).includes(value)} disabled={value === 'Darbuotojas'} onChange={(event) => onChange({ ...settings, requiredSigners: event.target.checked ? [...new Set([...(settings.requiredSigners ?? resource.requiredSigners ?? ['Darbuotojas']), value])] : (settings.requiredSigners ?? resource.requiredSigners ?? ['Darbuotojas']).filter((role) => role !== value) })} />{label}</label>)}</div></fieldset>
    <div className="mt-6 flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold" onClick={onClose}>Atšaukti</button><button className={buttonClass}><Check size={16} />Išsaugoti nustatymus</button></div>
  </form></div>;
}

function ResourceSettingsDialog({ resource, settings, onChange, onSave, onClose }) {
  const labels = {
    rowCount: 'Eilučių skaičius',
    populateEmployees: 'Automatiškai pildyti darbuotojus',
    date: 'Data',
    instructionNumber: 'Instrukcijos numeris',
    instructionTitle: 'Instruktavimo pavadinimas',
    instructorName: 'Instruktuojančiojo vardas, pavardė',
    instructorPosition: 'Instruktuojančiojo pareigos',
    regulationNumber: 'Pareiginių nuostatų Nr.',
    changedInstruction: 'Pakeista į',
    validityMonths: 'Galiojimas (mėnesiais)',
  };
  const textFields = Object.entries(settings).filter(([key, value]) => key !== 'requiredSigners' && typeof value !== 'boolean');
  const booleanFields = Object.entries(settings).filter(([, value]) => typeof value === 'boolean');

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"><form onSubmit={onSave} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-emerald-800">Įmonės šablono nustatymai</p><h2 className="mt-1 text-xl font-bold">{resource.title}</h2><p className="mt-1 text-sm text-slate-500">Šie nustatymai taikomi tik šiai įmonei.</p></div><button type="button" aria-label="Uždaryti nustatymus" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={onClose}><X size={20} /></button></div><div className="grid gap-4 sm:grid-cols-2">{textFields.map(([key, value]) => { const type = key === 'date' ? 'date' : ['rowCount', 'validityMonths'].includes(key) ? 'number' : 'text'; return <label key={key} className="text-sm font-medium">{labels[key] ?? key}<input className={`${inputClass} mt-1`} type={type} min={type === 'number' ? '1' : undefined} max={key === 'validityMonths' ? '120' : undefined} value={value ?? ''} onChange={(event) => onChange({ ...settings, [key]: event.target.value })} /></label>; })}{booleanFields.map(([key, value]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange({ ...settings, [key]: event.target.checked })} />{labels[key] ?? key}</label>)}</div><fieldset className="mt-5 space-y-2 rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">Kas turi pasirašyti</legend><div className="grid gap-2 sm:grid-cols-2">{signerRoleOptions.map(({ value, label }) => <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(settings.requiredSigners ?? []).includes(value)} disabled={value === 'Darbuotojas'} onChange={(event) => onChange({ ...settings, requiredSigners: event.target.checked ? [...new Set([...(settings.requiredSigners ?? []), value])] : (settings.requiredSigners ?? []).filter((role) => role !== value) })} />{label}{value === 'Darbuotojas' && <span className="text-xs text-slate-500">(privalomas)</span>}</label>)}</div></fieldset><div className="mt-5 flex justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={onClose}>Atšaukti</button><button className={buttonClass}><Check size={16} />Išsaugoti nustatymus</button></div></form></div>;
}

function ResourceCard({ resource, selected, workflowStatus, onToggle, onSettings, onPreview, onComplete, onDelete }) {
  const iconTone = resource.type === 'Testas' ? 'bg-sky-50 text-sky-800' : resource.type === 'Žurnalas' ? 'bg-amber-50 text-amber-800' : resource.type === 'Kortelė' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-800';
  const openAapSettings = () => {
    const settings = document.getElementById('aap-settings');
    if (settings instanceof HTMLDialogElement && !settings.open) settings.showModal();
  };

  return <article className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition-shadow hover:shadow-md">{resource.image ? <img src={resource.image} alt="" className="h-32 w-full object-cover" /> : <div className={`flex h-32 items-center justify-between px-5 ${iconTone}`}><BookOpen size={28} strokeWidth={1.6} /><span className="text-xs font-bold uppercase">{resource.type}</span></div>}<div className="flex flex-1 flex-col gap-3 p-4"><div><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-emerald-800">{resource.category}</p><span className="shrink-0 text-xs text-slate-500">{resource.type} · {resource.duration ?? '15 min.'}</span></div><h3 className="mt-2 min-h-10 font-bold leading-snug">{resource.title}</h3></div>{workflowStatus && <WorkflowBadge status={workflowStatus} />}<div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">{onToggle && resource.id === 'res-aap' && <button type="button" className="order-first inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50" onClick={openAapSettings}><Settings2 size={15} />Nustatymai</button>}{onSettings && resource.id !== 'res-aap' && <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50" onClick={onSettings}><Settings2 size={15} />Nustatymai</button>}{onPreview && <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50" onClick={onPreview}>Peržiūrėti</button>}{onToggle && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(selected)} onChange={(event) => onToggle(event.target.checked)} />Priskirti įmonei</label>}{onComplete && !['signed', 'awaitingDss', 'awaitingEmployer', 'awaitingCommission', 'awaitingSignatures'].includes(workflowStatus?.key) && <button className={buttonClass} onClick={onComplete}><FileSignature size={15} />{workflowStatus?.key === 'awaitingEmployer' ? 'Vadovo parašas' : workflowStatus?.key === 'started' || workflowStatus?.key === 'unsigned' ? 'Tęsti' : workflowStatus?.key === 'expired' ? 'Atnaujinti' : resource.type === 'Testas' ? 'Spręsti testą' : 'Atlikti užduotį'}</button>}{onDelete && <button className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-800" onClick={onDelete}>Pašalinti</button>}</div></div></article>;
}

function WorkflowBadge({ status }) {
  const tones = {
    todo: 'border-slate-200 bg-slate-50 text-slate-700',
    started: 'border-sky-200 bg-sky-50 text-sky-800',
    unsigned: 'border-amber-200 bg-amber-50 text-amber-900',
    signed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    awaitingDss: 'border-orange-200 bg-orange-50 text-orange-900',
    awaitingEmployer: 'border-amber-200 bg-amber-50 text-amber-900',
    awaitingCommission: 'border-amber-200 bg-amber-50 text-amber-900',
    awaitingSignatures: 'border-amber-200 bg-amber-50 text-amber-900',
    expired: 'border-rose-200 bg-rose-50 text-rose-800',
    needsSizes: 'border-amber-200 bg-amber-50 text-amber-900',
  };
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${tones[status.key] ?? tones.todo}`}><span className="size-1.5 rounded-full bg-current" />{status.label}</span>;
}
function RequiredSignerList({ employee, resource, org, signatures, now, specialists }) {
  const signers = getRequiredSignerEntries(employee, resource, org, signatures, now, specialists);
  return <div className="mt-2 grid grid-cols-1 gap-1" aria-label="Reikalingi parašai">{signers.map((signer) => {
    const signature = signer.signedAt && signatures.find((item) => item.employeeId === employee.id && item.resourceId === resource.id && item.role === signer.role && item.signer === signer.signedBy && item.signedAt === signer.signedAt);
    const statusLabel = signer.status === 'signed' ? 'pasirašė PIN kodu' : signer.status === 'expired' ? 'galiojimas baigėsi' : 'trūksta';
    const tone = signer.status === 'signed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800';
    return <div key={`${signer.role}-${signer.name}`} title={`${signer.role}: ${signer.name} · ${statusLabel}`} className={`min-w-0 rounded-md border px-2.5 py-2 ${tone}`}><span className="block truncate text-xs font-semibold">{signer.role} · {signer.name}</span><span className="mt-0.5 block text-xs">{statusLabel === 'pasirašė PIN kodu' ? 'Pasirašė PIN kodu' : statusLabel === 'trūksta' ? 'Trūksta parašo' : 'Parašo galiojimas baigėsi'}</span>{signature && <SignatureImagePreview signature={signature} />}{signer.signedAt && <time className="mt-0.5 block text-xs tabular-nums opacity-80" dateTime={signer.signedAt}>{new Date(signer.signedAt).toLocaleDateString('lt-LT')}</time>}</div>;
  })}</div>;
}
function SubscriptionCard({ subscription, onAction }) {
  if (!subscription) return <p className="text-sm text-slate-500">Prenumerata nerasta.</p>;
  return <div><p className="text-lg font-bold">{subscription.plan} · {subscription.price} €/mėn.</p><p className="mt-1 text-sm text-slate-600">Būsena: {subscription.status} · iki {subscription.endsAt}</p><div className="mt-4 flex flex-wrap gap-2">{subscription.status === 'Aktyvi' ? <button className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800" onClick={() => onAction(subscription.id, 'cancel')}><X size={15} className="inline" />Atšaukti</button> : <button className={buttonClass} onClick={() => onAction(subscription.id, 'renew')}><RotateCcw size={15} />Pratęsti prenumeratą</button>}</div></div>;
}
function CommissionEditor({ org, employees = [], assignments = [], onInvite, onRevoke, cloudMode = false, commissionPinStatus = {}, onSetPin, signingTarget, signPin, setSignPin, signError, onSign, onCancel }) {
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState('Komisijos narys');
  const [error, setError] = useState('');
  const [pins, setPins] = useState({});
  const [confirmPins, setConfirmPins] = useState({});
  if (!org) return null;
  const activeAssignments = assignments.filter((assignment) => ['pending', 'accepted'].includes(assignment.status));
  const visibleAssignments = assignments.filter((assignment) => assignment.status !== 'revoked');
  const availableEmployees = employees.filter((employee) => !activeAssignments.some((assignment) => assignment.employeeId === employee.id));
  const invite = async (event) => {
    event.preventDefault();
    if (!employeeId) {
      setError('Pasirinkite darbuotoją.');
      return;
    }
    const invited = await onInvite(employeeId, role);
    if (invited) {
      setEmployeeId('');
      setError('');
    } else {
      setError('Kvietimo išsiųsti nepavyko. Patikrinkite pranešimą puslapio viršuje.');
    }
  };
  const saveLegacyPin = async (event, member) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(pins[member] ?? '') || pins[member] !== confirmPins[member]) {
      setError(`„${member}“ PIN turi būti 4 skaitmenys, o abu įrašai turi sutapti.`);
      return;
    }
    if (await onSetPin(org.id, member, pins[member])) {
      setPins((current) => ({ ...current, [member]: '' }));
      setConfirmPins((current) => ({ ...current, [member]: '' }));
      setError('');
    }
  };
  const statusLabel = { pending: 'Laukia darbuotojo sutikimo', accepted: 'Aktyvus komisijos narys', declined: 'Kvietimo atsisakė', revoked: 'Paskyrimas atšauktas' };
  return <div className="space-y-4">
    <form className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={invite}>
      <label className="text-sm font-medium">Darbuotojas<select className={`${inputClass} mt-1`} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required><option value="">Pasirinkite darbuotoją</option>{availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
      <label className="text-sm font-medium">Komisijos pareigos<select className={`${inputClass} mt-1`} value={role} onChange={(event) => { setRole(event.target.value); setEmployeeId(''); }}><option value="Komisijos narys">Komisijos narys</option><option value="Komisijos pirmininkas" disabled={activeAssignments.some((assignment) => assignment.role === 'Komisijos pirmininkas')}>Komisijos pirmininkas</option></select></label>
      <button className={`${buttonClass} self-end`} disabled={!availableEmployees.length}><UserPlus size={16} />Kviesti</button>
    </form>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {visibleAssignments.length ? <div className="divide-y divide-slate-100">{visibleAssignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div><p className="font-semibold">{assignment.employeeName} · {assignment.role}</p><p className={`mt-1 text-sm ${assignment.status === 'accepted' ? 'text-emerald-700' : 'text-amber-700'}`}>{statusLabel[assignment.status]}{assignment.invitedAt ? ` · ${new Date(assignment.invitedAt).toLocaleDateString('lt-LT')}` : ''}</p>{assignment.status === 'accepted' && assignment.consentSignatureMethod && <p className="mt-1 text-xs text-slate-500">Sutikimas pasirašytas PIN kodu{assignment.respondedAt ? ` · ${new Date(assignment.respondedAt).toLocaleString('lt-LT')}` : ''}</p>}<SignatureImagePreview signature={assignment} /></div>
      {['pending', 'accepted'].includes(assignment.status) && <button type="button" className="rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => onRevoke(assignment)}>Atšaukti paskyrimą</button>}
    </div>)}</div> : <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">DSS komisijos nariai dar nepaskirti.</p>}
    {!!org.commission?.length && <details className="rounded-lg border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-semibold">Senų dokumentų komisijos parašų PIN</summary>
      <p className="mt-2 text-xs text-slate-500">Šis PIN valdymas paliktas senesniems dokumentams, kurių parašų eiga dar nėra susieta su darbuotojo komisijos paskyrimu. Naujų protokolų komisijos parašus darbuotojai tvirtina savo paskyrose.</p>
      <div className="mt-3 space-y-3">{org.commission.map((member) => <form className="grid gap-2 border-b border-slate-100 pb-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={member} onSubmit={(event) => saveLegacyPin(event, member)}>
        <div className="self-center text-sm font-semibold">{member}<small className="block font-normal text-slate-500">{(cloudMode ? commissionPinStatus[member] : org.commissionPins?.[member]) ? 'PIN nustatytas' : 'PIN nenustatytas'}</small></div>
        <label className="text-xs font-medium">Naujas 4 skaitmenų PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={pins[member] ?? ''} onChange={(event) => setPins((current) => ({ ...current, [member]: event.target.value }))} required /></label>
        <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-xs font-medium">Pakartokite PIN<input className={`${inputClass} mt-1`} type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={confirmPins[member] ?? ''} onChange={(event) => setConfirmPins((current) => ({ ...current, [member]: event.target.value }))} required /></label><button className={`${buttonClass} shrink-0`} aria-label={`Nustatyti ${member} PIN`}><LockKeyhole size={15} /></button></div>
      </form>)}</div>
      {signingTarget?.orgId === org.id && <form onSubmit={onSign} className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-4"><h3 className="font-semibold">Senas komisijos parašo veiksmas</h3><p className="mt-1 text-sm">{signingTarget.member} · {org.name}</p><label className="mt-3 block text-sm font-medium">Asmeninis 4 skaitmenų PIN<input className={`${inputClass} mt-1 max-w-xs`} type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={signPin} onChange={(event) => setSignPin(event.target.value)} required /></label>{signError && <p className="mt-2 text-sm text-rose-700">{signError}</p>}<div className="mt-4 flex justify-end gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={onCancel}>Atšaukti</button><button className={buttonClass}><FileSignature size={15} />Pasirašyti</button></div></form>}
    </details>}
  </div>;
}

function getValidityUntil(months) {
  return getValidityUntilFrom(new Date(), months);
}

function formatAmount(value) {
  return new Intl.NumberFormat('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function amountInLithuanianWords(value) {
  const centsTotal = Math.round((Number(value) || 0) * 100);
  const euros = Math.floor(centsTotal / 100);
  const cents = centsTotal % 100;
  return `${numberInLithuanianWords(euros)} ${lithuanianCountForm(euros, ['euras', 'eurai', 'eurų'])} ir ${numberInLithuanianWords(cents)} ${lithuanianCountForm(cents, ['centas', 'centai', 'centų'])}`;
}

function numberInLithuanianWords(value) {
  const number = Math.floor(Math.abs(Number(value) || 0));
  const small = ['nulis', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni', 'dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika', 'penkiolika', 'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika'];
  const tens = ['', '', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 'penkiasdešimt', 'šešiasdešimt', 'septyniasdešimt', 'aštuoniasdešimt', 'devyniasdešimt'];
  const underThousand = (part) => {
    const words = [];
    const hundreds = Math.floor(part / 100);
    const rest = part % 100;
    if (hundreds) words.push(hundreds === 1 ? 'šimtas' : `${small[hundreds]} šimtai`);
    if (rest < 20 && rest > 0) words.push(small[rest]);
    if (rest >= 20) {
      words.push(tens[Math.floor(rest / 10)]);
      if (rest % 10) words.push(small[rest % 10]);
    }
    return words.join(' ');
  };
  if (number === 0) return small[0];
  const groups = [
    { count: Math.floor(number / 1_000_000), forms: ['milijonas', 'milijonai', 'milijonų'] },
    { count: Math.floor((number % 1_000_000) / 1000), forms: ['tūkstantis', 'tūkstančiai', 'tūkstančių'] },
  ];
  const words = [];
  groups.forEach(({ count, forms }) => {
    if (count) words.push(`${underThousand(count)} ${lithuanianCountForm(count, forms)}`);
  });
  if (number % 1000) words.push(underThousand(number % 1000));
  return words.join(' ');
}

function lithuanianCountForm(value, forms) {
  const count = Math.abs(Math.floor(Number(value) || 0));
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return forms[2];
  const last = count % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 9) return forms[1];
  return forms[2];
}

function getValidityUntilFrom(date, months) {
  const expiry = new Date(date);
  expiry.setMonth(expiry.getMonth() + (Number(months) || 12));
  return expiry.toISOString();
}