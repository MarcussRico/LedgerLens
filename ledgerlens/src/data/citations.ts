import type { Citation } from './types'

export const citations: Citation[] = [
  { id: 'acfe-2026', label: 'Occupational Fraud 2026: A Report to the Nations', publisher: 'ACFE', year: 2026,
    url: 'https://www.acfe.com/about-the-acfe/newsroom-for-media/press-releases/press-release-detail?s=occupational-fraud-2026-a-report-to-the-nations-pr' },
  { id: 'acfe-summary', label: 'Key findings from the 2026 ACFE Report to the Nations', publisher: 'PBMares', year: 2026,
    url: 'https://www.pbmares.com/key-findings-from-the-2026-acfe-report-to-the-nations/' },
  { id: 'apqc-dup', label: 'Duplicate-payment benchmarks (APQC / IOFM)', publisher: 'ExpensePoint', year: 2025,
    url: 'https://www.expensepoint.com/blog/duplicate-payments/' },
  { id: 'maverick', label: 'Procurement maverick-spend benchmarks', publisher: 'Stampli', year: 2025,
    url: 'https://www.stampli.com/resources/procurement-maverick-spend-benchmarks/' },
  { id: 'nigrini', label: "Benford's Law: Applications for Forensic Accounting, Auditing and Fraud Detection", publisher: 'M. Nigrini · Wiley', year: 2012,
    url: 'https://www.wiley.com/en-us/Benford%27s+Law%3A+Applications+for+Forensic+Accounting%2C+Auditing%2C+and+Fraud+Detection-p-9781118152850' },
  { id: 'iforest', label: 'Isolation Forest', publisher: 'Liu, Ting & Zhou · ICDM', year: 2008,
    url: 'https://ieeexplore.ieee.org/document/4781136' },
  { id: 'msme-43b', label: 'Income Tax Act, India — Section 43B(h), MSME 45-day payment rule', publisher: 'Government of India', year: 2023,
    url: 'https://incometaxindia.gov.in/Pages/acts/income-tax-act.aspx' },
]

export const citationById = new Map(citations.map((c) => [c.id, c]))
