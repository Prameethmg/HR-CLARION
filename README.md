# HR-CLARION

*Enterprise-Ready AI HR Assistant & Grievance Platform*

🌐 [Live Demo](https://hr-clarion-jeomzvxdd-prameeth.vercel.app/)

HR-CLARION is a production-grade AI policy agent that uses Qwen reasoning and a hybrid RAG (Retrieval-Augmented Generation) architecture to automate HR queries. It features role-based dashboards, automated workflows, and an innovative, secure channel for employees to anonymously report workplace harassment and abuse.

**Core Philosophy:** The AI does not directly search the database and *never* invents policies. The backend retrieves relevant policy clauses, then gives those clauses and the employee record to the AI to produce a personalized, cited explanation.

---

## ✨ Features

- **Policy Assistant Chatbot:** Instantly answers employee queries regarding leave, WFH, and other company guidelines based strictly on official policy clauses.
- **Personalized HR Answers:** Uses deterministic filtering and vector search to fetch departmental rules and calculate individual eligibility (e.g., remaining WFH days).
- **Secure Incident Reporting:** Provides a safe channel for employees to report serious workplace issues. Users can choose to remain anonymous or reveal their identity.
- **Smart HR Escalations:** Automatically escalates questions to human HR staff if the AI lacks confidence, cannot find citations, or faces conflicting policies.
- **Fully Responsive UI:** Built with modern design principles ensuring compatibility across all devices.
- **Built-in Internationalization:** Seamless multi-language support via `i18next`.

---

## 🏗️ High-Level Architecture

The application is distributed across four main pillars:

```text
Employee Browser (React/Vite) 
      ↓
Vercel-hosted Frontend 
      ↓
Supabase Edge Functions (Backend API)
      ↓
Supabase PostgreSQL + pgvector
      ↓
Enter AI Gateway (Qwen-3.7-plus model)
