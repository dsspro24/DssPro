import test from 'node:test';
import assert from 'node:assert/strict';
import { updateProtocolBatchRevision } from './protocolBatchRevisions.js';

const employee = (id, name, testResults = []) => ({
  id,
  name,
  position: 'Darbuotojas',
  contractNumber: `C-${id}`,
  sequenceNumbersByResource: {},
  testResults,
});

const makeBatch = (overrides = {}) => ({
  id: 'batch-1',
  number: 1,
  revision: 1,
  employeeIds: ['employee-1'],
  employeeSnapshots: [{
    id: 'employee-1',
    name: 'Jonas',
    position: 'Darbuotojas',
    contractNumber: 'C-employee-1',
    sequenceNumbersByResource: {},
    testResults: [{ resourceId: 'test-1', passed: true, score: 100 }],
  }],
  ...overrides,
});

const update = ({ batch, employee: updatedEmployee, testResult, isSigned = true }) => updateProtocolBatchRevision({
  batches: [batch],
  batch,
  employee: updatedEmployee,
  employeeDirectory: new Map([[updatedEmployee.id, updatedEmployee], ['employee-1', employee('employee-1', 'Jonas')]]),
  isSigned,
  testResult,
  getEmployeeTestResult: (record) => record.testResults?.[0] ?? null,
});

test('adding an employee to a signed protocol creates a new revision and retains the signed batch', () => {
  const batch = makeBatch();
  const newEmployee = employee('employee-2', 'Ona');

  const result = update({ batch, employee: newEmployee, isSigned: true });

  assert.equal(result.batches.length, 2);
  assert.equal(result.batches[0], batch);
  assert.equal(result.batch.id, 'batch-1-revision-2');
  assert.equal(result.batch.number, batch.number);
  assert.deepEqual(result.batch.employeeIds, ['employee-1', 'employee-2']);
  assert.deepEqual(result.batch.employeeSnapshots.map(({ name }) => name), ['Jonas', 'Ona']);
});

test('changing a signed employee test result creates a revision with the new result snapshot', () => {
  const batch = makeBatch();
  const resultSnapshot = { resourceId: 'test-1', passed: true, score: 90 };
  const updatedEmployee = employee('employee-1', 'Jonas', [resultSnapshot]);

  const result = update({ batch, employee: updatedEmployee, testResult: resultSnapshot });

  assert.equal(result.batches.length, 2);
  assert.equal(result.batch.id, 'batch-1-revision-2');
  assert.deepEqual(result.batch.employeeSnapshots[0].testResults, [resultSnapshot]);
  assert.deepEqual(batch.employeeSnapshots[0].testResults, [{ resourceId: 'test-1', passed: true, score: 100 }]);
});

test('updating an unsigned protocol changes its snapshot without creating another batch', () => {
  const batch = makeBatch();
  const updatedEmployee = employee('employee-1', 'Jonas');
  const resultSnapshot = { resourceId: 'test-1', passed: true, score: 90 };

  const result = update({ batch, employee: updatedEmployee, testResult: resultSnapshot, isSigned: false });

  assert.equal(result.batches.length, 1);
  assert.equal(result.batch.id, batch.id);
  assert.deepEqual(result.batch.employeeSnapshots[0].testResults, [resultSnapshot]);
});
