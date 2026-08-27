import { Section, Reveal } from '../components/ui/primitives'

const WAYS = [
  {
    n: '01',
    title: 'The same bill gets paid twice.',
    body: 'A vendor’s invoice goes unanswered for three weeks. Their accounts team politely re-sends it — same work, new invoice number, slightly different date. Both get paid. Nobody committed fraud. It is the single largest category of leakage.',
    why: 'a duplicate check on invoice number finds nothing. The numbers are different.',
  },
  {
    n: '02',
    title: 'You are being overcharged and have no idea.',
    body: 'Department A buys A4 paper at ₹240 a ream. Department B buys the same paper at ₹185. Neither knows, because the item is written differently in each system — “A4 PAPER 75GSM RM” against “Paper, A4, white, 75gsm”.',
    why: 'you would have to normalise every item name into one catalogue before a single price could be compared.',
  },
  {
    n: '03',
    title: 'The price creeps.',
    body: 'A vendor raises the price 3% every quarter. Each raise is too small to trigger anything, too small to argue about, too small to notice. Two years later you are 26% over market.',
    why: 'no single transaction is wrong. Only the slope is.',
  },
  {
    n: '04',
    title: 'Approval limits get gamed.',
    body: 'Purchases above ₹50,000 need director sign-off — so a ₹2.4 lakh purchase becomes five orders of ₹48,000 to the same vendor in the same week. Every one of them is signed off correctly by a manager acting within their authority.',
    why: 'each order passes inspection. The bypass only exists across all five.',
  },
  {
    n: '05',
    title: 'The vendor does not exist.',
    body: 'Clean paperwork, valid GSTIN, invoices for “site maintenance” — nothing physical to receive, so nothing to verify. Two “different” vendors share one bank account. One address matches an employee’s home.',
    why: 'those facts live in three systems owned by three teams. Nobody joins vendor master data to HR records at 11pm.',
  },
  {
    n: '06',
    title: 'Spending behaves strangely and nobody asks.',
    body: 'March spend is 4× the monthly average, every year. Invoices submitted at 2am on a Sunday. “Emergency, single-source” invoked thirty times by one manager.',
    why: 'finance reviews totals. These are patterns, and patterns are invisible in a total.',
  },
]

export function S04Ways() {
  return (
    <Section n="04" id="ways" kicker="04 — Six ways it actually happens"
      title={<>None of these need a criminal. Most of them need nobody at all.</>}>
      <div className="mt-16 grid grid-cols-12 gap-x-8 gap-y-px">
        {WAYS.map((w, i) => (
          <Reveal key={w.n} delay={(i % 2) * 0.055}
            className={i % 2 === 0 ? 'col-span-12 lg:col-span-6 lg:col-start-1' : 'col-span-12 lg:col-span-6 lg:col-start-7'}>
            <article className="group relative h-full border-t border-[var(--color-line)] py-9 pr-2 transition-colors hover:border-[var(--color-paper-dim)]">
              <div className="flex items-baseline gap-5">
                <span className="num shrink-0 text-2xs text-[var(--color-muted)]">{w.n}</span>
                <h3 className="text-[clamp(1.25rem,2.1vw,1.75rem)] leading-[1.15] text-[var(--color-paper)]">{w.title}</h3>
              </div>
              <p className="mt-4 max-w-[58ch] pl-0 text-[0.9375rem] leading-[1.7] text-[var(--color-paper-dim)] sm:pl-[3.15rem]">
                {w.body}
              </p>
              <p className="mt-5 max-w-[58ch] pl-0 text-[0.875rem] leading-relaxed text-[var(--color-signal)] sm:pl-[3.15rem]">
                <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] opacity-80">Why nobody catches it — </span>
                {w.why}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
