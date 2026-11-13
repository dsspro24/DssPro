const createEmployeeSnapshot = (employee, testResult) => ({
  id: employee.id,
  name: employee.name,
  position: employee.position ?? '',
  contractNumber: employee.contractNumber ?? '',
  sequenceNumbersByResource: employee.sequenceNumbersByResource ?? {},
  testResults: testResult ? [testResult] : [],
});

const sameEmployeeSnapshot = (left, right) => left.name === right.name
  && left.position === right.position
  && left.contractNumber === right.contractNumber
  && JSON.stringify(left.sequenceNumbersByResource ?? {}) === JSON.stringify(right.sequenceNumbersByResource ?? {})
  && JSON.stringify(left.testResults ?? []) === JSON.stringify(right.testResults ?? []);

export const updateProtocolBatchRevision = ({
  batches,
  batch,
  employee,
  employeeDirectory,
  isSigned,
  testResult,
  getEmployeeTestResult,
}) => {
  const employeeIds = [...new Set([...(batch.employeeIds ?? []), employee.id])];
  const snapshotsById = new Map((batch.employeeSnapshots ?? []).map((snapshot) => [snapshot.id, snapshot]));
  const currentEmployeeSnapshot = createEmployeeSnapshot(employee, testResult);
  const previousEmployeeSnapshot = snapshotsById.get(employee.id);
  const rosterChanged = employeeIds.length !== (batch.employeeIds ?? []).length;
  const employeeChanged = previousEmployeeSnapshot
    ? !sameEmployeeSnapshot(previousEmployeeSnapshot, currentEmployeeSnapshot)
    : Boolean(testResult);

  if (!rosterChanged && !employeeChanged && (isSigned || batch.employeeSnapshots)) {
    return { batches, batch };
  }

  snapshotsById.set(employee.id, currentEmployeeSnapshot);
  const employeeSnapshots = employeeIds.map((employeeId) => {
    const snapshot = snapshotsById.get(employeeId);
    if (snapshot) return snapshot;
    const employeeRecord = employeeDirectory.get(employeeId);
    return employeeRecord
      ? createEmployeeSnapshot(employeeRecord, getEmployeeTestResult(employeeRecord))
      : null;
  }).filter(Boolean);

  const updatedBatch = { ...batch, employeeIds, employeeSnapshots };
  if (isSigned) {
    const revision = Math.max(1, Number(batch.revision) || 1) + 1;
    const revisedBatch = {
      ...updatedBatch,
      id: `${batch.id}-revision-${revision}`,
      revision,
      supersedesBatchId: batch.id,
      createdAt: new Date().toISOString(),
    };
    return { batches: [...batches, revisedBatch], batch: revisedBatch };
  }

  const nextBatches = batches.map((item) => item.id === batch.id ? updatedBatch : item);
  return { batches: nextBatches, batch: updatedBatch };
};
