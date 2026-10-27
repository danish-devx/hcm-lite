# 5-Minute Demo Script — Bloom (HCM Lite)

Judges ke saamne exact flow — brief Section 9 ke mutabiq, har step ka expected result ke saath.
**Tip:** demo se pehle hosted link ek incognito window me khol kar dekh lein — first-run wizard dikhna chahiye.

---

## 0:00–1:00 — Fresh install → Admin sets up the company

1. Open the **hosted link** (incognito).
2. First-run wizard: company name **"Saylani Demo Ltd"**, office start **09:00**, grace **15**, weekend **Sat+Sun**, (optional) office location + radius **150 m** → create Admin account.
   - *Expected:* redirect to the Admin dashboard — empty state ("No departments yet") kyunki system starts empty.
3. Left sidebar → **Organization**: create department **Engineering** (+ designation **Engineer**). Leave types annual 14 / sick 8 / casual 10 / unpaid ∞ already seeded — khul kar dikha dein.
   - *Expected:* lists live update; admin ke saare actions audit log me jate hain.

## 1:00–2:00 — HR registers employees; one employee checks in

4. Logout → login as the **HR** account (Admin ne "Users" me banaya).
5. **Employees → Register**: add **Ali Raza** (Engineering, Engineer, basic salary 40,000) aur ek doosra employee.
   - *Expected:* toast "login created — temporary password"; temporary password screen par dikh raha hota hai.
6. New incognito window → login as **Ali** → forced **change password** → dashboard.
7. Ali presses **Check in**.
   - *Expected:* server-stamped time, "Checked in" toast; status chip **On time** (ya **Late** agar 09:15 guzar gaye — ye bhi rule hai, explain kar dein).

## 2:00–3:00 — Smart leave (plain words) → HR approves

8. As Ali, **Leave → assistant card** me type: *"Need next Monday and Tuesday off for my sister's wedding"* → **Confirm & send**.
   - *Expected:* pre-filled **casual** leave, correct Monday–Tuesday dates, working-days count + balance-after preview — user confirms (AI kuch bhi khud save nahi karta).
9. Back as **HR** → **Leave approval inbox** → comment likh kar **Approve**.
   - *Expected:* Ali ko in-app notification ("Leave approved"), balances live kam.

## 3:00–4:00 — Dashboard summary + AI assistant → payroll run

10. As **HR**, open **Dashboard** → click **Summarize with AI**.
    - *Expected:* 3–5 bullets **sirf dashboard numbers se** (headcount, attendance rate, pending approvals).
11. Assistant me poochein: **"Who is on leave today?"**
    - *Expected:* tool-chip (`get_leave_summary`) + same numbers as dashboard; "AI-generated" label.
12. **Payroll → New run** (current month) → draft with per-employee gross, deductions (absent/unpaid/half-day/late penalty), tax.
    - Ali ke paas 1 absent ho to per-day deduction dikh raha hoga — *3 lates = 0.5 day* rule ke liye footnote point karein.
13. Logout → **Admin** → Payroll → **Finalize & lock**.
    - *Expected:* locked badge; HR view par Finalize button gayab (only Admin can lock).

## 4:00–5:00 — Payslip → salary refusal → audit log

14. As **Ali**: **My Payslips** → **download PDF**.
    - *Expected:* clean A4 payslip (earnings/deductions/tax/net + slab note).
15. Ali asks the assistant: **"What is Aliya's salary?"**
    - *Expected:* **polite refusal** — koi salary figure leak nahi hota (role-scope live demo).
16. As **Admin**: **Audit Log** → search "finalize" → row par click → before/after JSON.
    - *Expected:* actor, action, entity, JSON diff — immutable trail.
17. (Chahay to) Admin dashboard → **Attrition risk** panel + dark-mode toggle (Plum Noir, charts recolor) + phone par 375px responsive.

---

## Judge Q&A — expected live answers

| Asked (as) | Question | Good answer |
|---|---|---|
| HR | How many active employees are in {department}? | Same number as dashboard (tool `get_headcount`) |
| HR | Who came late most often this month? | Top late-comers list se match (tool `get_late_comers`) |
| HR | What is this month's attendance rate? | Brief formula ka exact number (tool `get_attendance_summary`) |
| Employee | How many sick leaves do I have left this year? | Own balance after approved leaves |
| Employee | What is {colleague}'s salary? | **Politely refuses** — no figure |
| Employee | I need next Monday and Tuesday off for my sister's wedding | Pre-filled **casual** leave, correct dates |
| Any | Policy Q&A ("what's the grace time?") | Rules system prompt me — settings se live |
| Any | AI down ho to? | Graceful fallback message + normal form; app kabhi break nahi hoti |

## Talking points (agar waqt bache)

- **Security:** server-side role + data-scope on every request; RLS second layer; AI key server-only; audit log immutable.
- **No dummy data:** judges ke banaye records hi dashboards aur AI answers me aate hain.
- **Camera check-in bonus:** Employee dashboard → **Camera** — exactly-one-face rule, GPS accuracy ≤ 100 m client+server dono par, koi photo store nahi hoti.
- **Payroll honesty:** proration (joiners/leavers), current-month cutoff (future days absent nahi ginte), finalized = locked (API + DB trigger).
