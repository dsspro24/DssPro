import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const rootElement = document.getElementById('root');
const validationControlSelector = 'input, select, textarea';

const setLithuanianValidationMessage = (event) => {
  const field = event.target;
  if (!(field instanceof HTMLElement) || !field.matches(validationControlSelector)) return;

  const { validity } = field;
  let message = '';
  if (validity.valueMissing) {
    message = field.type === 'checkbox' || field.type === 'radio' ? 'Pažymėkite šį laukelį.' : 'Užpildykite šį lauką.';
  } else if (validity.typeMismatch && field.type === 'email') {
    message = 'Įveskite galiojantį el. pašto adresą.';
  } else if (validity.typeMismatch && field.type === 'url') {
    message = 'Įveskite galiojantį interneto adresą.';
  } else if (validity.patternMismatch) {
    message = 'Įveskite reikiamo formato reikšmę.';
  } else if (validity.tooShort) {
    message = `Įveskite bent ${field.minLength} simbolius.`;
  } else if (validity.tooLong) {
    message = `Įveskite ne daugiau kaip ${field.maxLength} simbolių.`;
  } else if (validity.rangeUnderflow) {
    message = `Reikšmė turi būti ne mažesnė nei ${field.min}.`;
  } else if (validity.rangeOverflow) {
    message = `Reikšmė turi būti ne didesnė nei ${field.max}.`;
  } else if (validity.stepMismatch || validity.badInput) {
    message = 'Įveskite tinkamą reikšmę.';
  }
  field.setCustomValidity(message);
};

const clearValidationMessage = (event) => {
  const field = event.target;
  if (field instanceof HTMLElement && field.matches(validationControlSelector)) field.setCustomValidity('');
};

rootElement.addEventListener('invalid', setLithuanianValidationMessage, true);
rootElement.addEventListener('input', clearValidationMessage, true);
rootElement.addEventListener('change', clearValidationMessage, true);

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
