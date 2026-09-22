import { describe, expect, it } from 'vitest'
import { classifyRow } from './row-classifier'

describe('classifyRow', () => {
  it('classifies a row with a worker_number as a worker row', () => {
    expect(
      classifyRow({ workerNumber: '17', workerName: 'محمد أحمد', otherRowTexts: [] }),
    ).toBe('worker')
  })

  it('classifies an empty-worker_number row containing a subtotal keyword as subtotal', () => {
    expect(
      classifyRow({ workerNumber: null, workerName: 'اجمالي الموقع', otherRowTexts: [] }),
    ).toBe('subtotal')
  })

  it('finds a subtotal keyword even when it is in another column, not the name column', () => {
    expect(
      classifyRow({ workerNumber: '', workerName: null, otherRowTexts: ['', 'مجموع الشهر', ''] }),
    ).toBe('subtotal')
  })

  it('classifies an empty-worker_number row containing a non-worker-cost keyword as non_worker_cost', () => {
    expect(
      classifyRow({ workerNumber: null, workerName: 'ايجار السيارة', otherRowTexts: [] }),
    ).toBe('non_worker_cost')
  })

  it('classifies an empty-worker_number row with no matching keyword as unknown, never dropped', () => {
    const result = classifyRow({ workerNumber: '  ', workerName: 'شيء غير معروف تمامًا', otherRowTexts: [] })
    expect(result).toBe('unknown')
  })

  it('classifies a fully blank row as unknown rather than throwing', () => {
    expect(classifyRow({ workerNumber: null, workerName: null, otherRowTexts: [] })).toBe('unknown')
  })

  it('treats a worker_number of only whitespace as empty', () => {
    expect(
      classifyRow({ workerNumber: '   ', workerName: 'اجمالي', otherRowTexts: [] }),
    ).toBe('subtotal')
  })
})
