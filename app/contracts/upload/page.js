'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

// Sample realistic contracts for instant 1-click testing during evaluations
const SAMPLE_CONTRACTS = [
  {
    title: 'Vendor Services Agreement (High Risk: Liability & Unilateral Termination)',
    fileName: 'Vendor_Services_Agreement_Risky.txt',
    text: `1. Term and Scope. This Vendor Services Agreement is effective as of November 1, 2024, by and between Client Org and Service Provider LLC.

2. Unilateral Termination. Service Provider may terminate this Agreement at any time, for any reason or no reason whatsoever, upon twenty-four (24) hours written notice to Client, without penalty, refund, or ongoing obligation.

3. Unlimited Liability. Client agrees that in no event shall Service Provider's total aggregate liability under this agreement be subject to any cap, but Client shall indemnify, hold harmless, and reimburse Service Provider for all direct, indirect, incidental, punitive, or consequential damages whatsoever without limitation.

4. Automatic Renewal. This Agreement shall automatically renew for successive consecutive terms of three (3) years unless Client provides certified written notice of cancellation no earlier than 180 days and no later than 175 days prior to the expiration of the initial term.

5. Payment Terms. Invoices are payable upon receipt. Any balance overdue by more than three days shall accrue interest at 18% per annum or the maximum rate permissible by law, plus reasonable attorney fees incurred in collection.

6. Governing Law. This Agreement shall be governed in accordance with the laws of Delaware, and the parties submit to exclusive venue therein.`,
  },
  {
    title: 'SaaS Subscription Agreement (Auto-Renewal & Indemnity Traps)',
    fileName: 'SaaS_Subscription_Trap.txt',
    text: `1. Subscription Grant. Provider grants Customer a non-exclusive, non-transferable license to access the Cloud Analytics Platform during the agreed Subscription Term.

2. Automatic Renewal and Fee Escalation. The subscription shall automatically renew at the expiration of the current period for an additional twelve (12) month term, and subscription fees shall automatically increase by twenty-five percent (25%) upon each renewal date without prior notification.

3. Asymmetric Indemnification. Customer shall defend, indemnify, and hold harmless Provider and its officers from and against any third-party claims, liabilities, losses, costs, or damages arising out of Customer's use of the software, regardless of whether Provider was negligent.

4. Confidentiality. Both parties acknowledge that information disclosed under this Agreement shall be deemed confidential and proprietary, and neither party shall disclose such information without express written consent.

5. Dispute Resolution. Any dispute arising under this agreement shall be settled through binding arbitration administered in New York, NY.`,
  },
  {
    title: 'Standard Mutual Consulting Agreement (Clean / Low Risk)',
    fileName: 'Mutual_Consulting_Agreement_Clean.txt',
    text: `1. Engagement. Consultant agrees to perform the digital strategy advisory services described in Exhibit A with standard professional skill and diligence.

2. Mutual Termination. Either party may terminate this Agreement for convenience upon sixty (60) days prior written notice, or immediately upon written notice if the other party breaches any material term and fails to cure within thirty (30) days.

3. Mutual Limitation of Liability. Neither party shall be liable for indirect, incidental, or special damages. Each party's maximum aggregate liability shall be limited to the total fees paid by Client during the twelve (12) months preceding the claim.

4. Mutual Confidentiality. Each party agrees to hold the other party's proprietary information in confidence and protect it with the same degree of care it uses for its own confidential information of like kind.

5. Independent Contractor. Consultant is an independent contractor and nothing herein shall be construed to create an employment, partnership, or agency relationship between the parties.`,
  },
];

export default function ContractUploadPage() {
  const router = useRouter();
  const [fileName, setFileName] = useState('');
  const [contractText, setContractText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadStep, setUploadStep] = useState('');

  function loadSample(sample) {
    setFileName(sample.fileName);
    setContractText(sample.text);
    setFile(null);
    setError(null);
  }

  function handleFileChange(e) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError(null);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!file && !contractText.trim()) {
      setError('Please provide contract text or select a file to upload.');
      return;
    }

    try {
      setLoading(true);
      setUploadStep('Segmenting clauses and computing 384-dim embeddings...');

      const formData = new FormData();
      formData.append('fileName', fileName.trim() || 'Uploaded_Contract.txt');

      if (file) {
        formData.append('file', file);
      } else {
        formData.append('text', contractText);
      }

      const res = await fetch('/api/contracts', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Contract upload failed');
      }

      setUploadStep('Database triggers evaluated! Redirecting to clause breakdown...');

      // Redirect directly to the clause breakdown UI
      router.push(`/contracts/${data.contractId}`);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
      setLoading(false);
      setUploadStep('');
    }
  }

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '2.5rem 1rem', maxWidth: '900px' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Upload Contract for Analysis</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Ingest contracts in plaintext or PDF. Clauses are automatically segmented, embedded into 384 dimensions,
            and evaluated against the risk pattern library via PostgreSQL triggers.
          </p>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {/* 1-Click Sample Contracts Card */}
        <div
          className="card"
          style={{
            padding: '1.5rem',
            marginBottom: '2rem',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(22, 24, 48, 0.7) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem' }}>⚡</span>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#fff' }}>
              Instant Demo: Pre-Loaded Sample Contracts
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Click any template below to populate the contract text and file name instantly for quick rubric testing:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {SAMPLE_CONTRACTS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadSample(sample)}
                style={{ textAlign: 'left', justifyContent: 'flex-start', padding: '0.6rem 1rem', fontWeight: 500 }}
              >
                📄 {sample.title}
              </button>
            ))}
          </div>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleSubmit} className="card" style={{ padding: '2rem' }}>
          {/* File Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="contract-filename">
              Contract Title / File Name
            </label>
            <input
              id="contract-filename"
              type="text"
              className="input"
              placeholder="e.g. Master_Service_Agreement_2024.pdf"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              required
            />
          </div>

          {/* PDF or Text file upload */}
          <div className="form-group">
            <label className="form-label">Upload File (PDF or Plaintext TXT)</label>
            <div
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 'var(--radius)',
                padding: '1.5rem',
                textAlign: 'center',
                background: 'rgba(22, 24, 48, 0.3)',
                cursor: 'pointer',
              }}
              onClick={() => document.getElementById('contract-file-input')?.click()}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📎</div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {file ? file.name : 'Click to select PDF or TXT file from your device'}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Maximum size: 5 MB • Text extracted locally on server
              </p>
              <input
                id="contract-file-input"
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div style={{ textAlign: 'center', margin: '1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            — OR PASTE RAW CONTRACT TEXT BELOW —
          </div>

          {/* Raw Contract Text */}
          <div className="form-group">
            <label className="form-label" htmlFor="contract-text-input">
              Contract Text (Numbered clauses or separated by blank lines)
            </label>
            <textarea
              id="contract-text-input"
              className="input"
              rows={12}
              placeholder="Paste contract clauses here... e.g.:&#10;1. Term. The agreement begins on the effective date.&#10;&#10;2. Termination. Either party may terminate..."
              value={contractText}
              onChange={(e) => {
                setContractText(e.target.value);
                if (file) setFile(null);
              }}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.5 }}
            />
          </div>

          {/* Loading status message */}
          {loading && (
            <div
              style={{
                padding: '1rem',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1.5rem',
              }}
            >
              <div className="loading-spinner" style={{ width: '20px', height: '20px' }}></div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-accent)' }}>{uploadStep}</span>
            </div>
          )}

          {/* Submit Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => router.push('/dashboard')}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="submit-upload-btn"
              className="btn btn-primary"
              disabled={loading}
              style={{ minWidth: '180px' }}
            >
              {loading ? 'Processing...' : 'Run Risk Analysis →'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
