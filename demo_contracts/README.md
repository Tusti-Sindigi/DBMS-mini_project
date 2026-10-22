# ClauseGuard — Live Demo Contracts & Cheat Sheet

All 6 sample contracts now have **100% authentic, corporate names** without any labels like `HighRisk` or `Clean`.

You can upload these directly in your demo, or even let your teacher rename them to anything they want to prove that ClauseGuard evaluates **semantic content**, not file names!

---

## 📋 Quick Reference Card (For Your Eyes Only)

| File Name | Real Contract Type | Expected Demo Result | Key Clauses & Risks Caught |
| :--- | :--- | :---: | :--- |
| [Apex_Logistics_Vendor_Agreement.txt](file:///d:/DBMS_MiniProject/DBMS-mini_project/demo_contracts/Apex_Logistics_Vendor_Agreement.txt) | Vendor / Supply Chain | 🚨 **High Risk** (Multiple Flags) | **Clause 2:** Unilateral Termination<br>**Clause 3:** Unlimited Liability<br>**Clause 4:** One-Sided Indemnity<br>**Clause 5:** Auto-Renewal Trap |
| [CloudCore_SaaS_Subscription_Terms.txt](file:///d:/DBMS_MiniProject/DBMS-mini_project/demo_contracts/CloudCore_SaaS_Subscription_Terms.txt) | Enterprise Software License | 🚨 **High Risk** (Multiple Flags) | **Clause 2:** Auto-Renewal Trap (180-day lock)<br>**Clause 3 & 4:** Vague Payment & Unilateral Price Hikes<br>**Clause 5:** Immediate Suspension / No Refund |
| [Independent_Contractor_Agreement.txt](file:///d:/DBMS_MiniProject/DBMS-mini_project/demo_contracts/Independent_Contractor_Agreement.txt) | Freelance Services Agreement | 🚨 **High Risk** (Multiple Flags) | **Clause 2:** Vague Payment Terms & Compound Fees<br>**Clause 3 & 4:** Loss Assumption & Defense Costs<br>**Clause 5:** Supplier-Only Termination |
| [Mutual_Non_Disclosure_Agreement.txt](file:///d:/DBMS_MiniProject/DBMS-mini_project/demo_contracts/Mutual_Non_Disclosure_Agreement.txt) | Mutual NDA | 🟢 **Safe / Clean** (0 Flags) | Standard confidentiality, reasonable 2-year duration, mutual injunctive relief. |
| [Software_Consulting_Services_SOW.txt](file:///d:/DBMS_MiniProject/DBMS-mini_project/demo_contracts/Software_Consulting_Services_SOW.txt) | IT Consulting SOW | 🟢 **Safe / Clean** (0 Flags) | Mutual 30-day notice, capped liability (6 months fees), clear Net-30 payment. |
| [Commercial_Office_Lease_Agreement.txt](file:///d:/DBMS_MiniProject/DBMS-mini_project/demo_contracts/Commercial_Office_Lease_Agreement.txt) | Commercial Real Estate Lease | 🟢 **Safe / Clean** (0 Flags) | Standard rent due dates, security deposit protections, explicit non-automatic renewal. |

---

## 🎬 Recommended 3-Step Live Demo Flow

### 1. Show the Detection (Upload `Apex_Logistics_Vendor_Agreement.txt`)
* Login: `client@clauseguard.local` / `client123`
* Upload [Apex_Logistics_Vendor_Agreement.txt](file:///d:/DBMS_MiniProject/DBMS-mini_project/demo_contracts/Apex_Logistics_Vendor_Agreement.txt).
* Show how the AI segments into clauses and PostgreSQL flags clauses 2, 3, 4, 5 in **red**.
* Point to the Cosine Similarity percentage (e.g. 88%).

### 2. Show No False Positives (Upload `Mutual_Non_Disclosure_Agreement.txt`)
* Upload [Mutual_Non_Disclosure_Agreement.txt](file:///d:/DBMS_MiniProject/DBMS-mini_project/demo_contracts/Mutual_Non_Disclosure_Agreement.txt).
* Show that the AI gives **0 flags** and a clean score of **0.00**.
* **Flex to the Professor:** *"Notice how balanced legal language stays below our 0.75 cosine similarity threshold, eliminating false alarms."*

### 3. Show the Reviewer Workflow & Audit Trail
* Logout and login as Reviewer: `reviewer@clauseguard.local` / `reviewer123`.
* View the unresolved flags list (backed by our SQL CTE View `unresolved_flags_by_client`).
* Click **Review Flag** -> choose **Escalate** or **Clear** with a note -> Submit.
* Show that the status updates instantly and records an audit row in `flag_reviews` via an ACID transaction.
