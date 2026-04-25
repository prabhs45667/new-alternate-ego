"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startOnboarding } from "@/lib/api";

export default function UploadPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [facebook, setFacebook] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dataFiles, setDataFiles] = useState<File[]>([]);
  const [mounted, setMounted] = useState(false);

  // Trigger entry animation after mount
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setDataFiles(Array.from(e.target.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setDataFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!consent) {
      setError("Please accept the privacy consent");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await startOnboarding({
        name: name.trim(),
        linkedin_url: linkedin.trim(),
        instagram_url: instagram.trim(),
        twitter_url: twitter.trim(),
        facebook_url: facebook.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });

      localStorage.setItem(
        "ego_session",
        JSON.stringify({
          user_id: result.user_id,
          twin_id: result.twin_id,
          session_id: result.session_id,
          name: name.trim(),
          linkedin_url: linkedin.trim(),
          instagram_url: instagram.trim(),
          twitter_url: twitter.trim(),
          facebook_url: facebook.trim(),
          email: email.trim(),
          phone: phone.trim(),
          data_files: dataFiles.map(f => f.name),
        })
      );

      if (dataFiles.length > 0) {
        localStorage.setItem("ego_has_data_file", "true");
      }

      router.push("/onboarding");
    } catch (err) {
      setError("Failed to connect to backend. Is the server running on port 8000?");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-page">
      <div className="form-bg" />
      <div className="form-bg-overlay" />

      <div className={`upload-form-container ${mounted ? "upload-visible" : ""}`}>
        <div className="form-card">
          {/* Form header */}
          <div className="text-center">
            <h1 className="ego-title">Alternate Ego</h1>
            <p className="ego-subtitle">UPLOAD YOURSELF</p>
          </div>

          {/* Name */}
          <div className="input-group">
            <input
              id="name-input"
              type="text"
              className="input-glass"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {/* Social profiles */}
          <span className="social-inputs-label">SOCIAL PROFILES (OPTIONAL)</span>

          <div className="social-grid">
            <div className="social-input-row">
              <span className="social-icon">💼</span>
              <input
                className="input-glass"
                placeholder="LinkedIn URL"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
              />
            </div>
            <div className="social-input-row">
              <span className="social-icon">📸</span>
              <input
                className="input-glass"
                placeholder="Instagram URL or @handle"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
              />
            </div>
            <div className="social-input-row">
              <span className="social-icon">🐦</span>
              <input
                className="input-glass"
                placeholder="Twitter/X URL or @handle"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
              />
            </div>
            <div className="social-input-row">
              <span className="social-icon">📘</span>
              <input
                className="input-glass"
                placeholder="Facebook URL"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
              />
            </div>
          </div>

          <span className="social-inputs-label mt-4">CONTACT INFO (OPTIONAL)</span>

          <div className="social-grid">
            <div className="social-input-row">
              <span className="social-icon">📧</span>
              <input
                className="input-glass"
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="social-input-row">
              <span className="social-icon">📱</span>
              <input
                className="input-glass"
                placeholder="Phone number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <span className="social-inputs-label mt-4">DATA EXPORT ZIP (OPTIONAL)</span>
          
          <div className="input-group">
            <input
              type="file"
              accept=".zip"
              multiple
              className="input-glass text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600/50 file:text-white hover:file:bg-purple-600/70"
              onChange={handleFileChange}
            />
            {dataFiles.length > 0 && (
              <div className="mt-2 text-sm text-white/80 space-y-1">
                {dataFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/10 px-3 py-1 rounded">
                    <span className="truncate w-4/5">{f.name}</span>
                    <button onClick={() => handleRemoveFile(i)} className="text-red-400 font-bold ml-2">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Privacy Box */}
          <div className="privacy-box">
            <h3 className="privacy-title">
              <span>🛡️</span> Your Privacy is Protected
            </h3>
            <ul className="privacy-list">
              <li>Your data is encrypted and processed locally on your device</li>
              <li>We never share your data with anyone</li>
              <li>Raw files are deleted automatically after processing</li>
              <li>You can delete all your data at any time</li>
            </ul>
          </div>

          {/* Consent */}
          <label className="consent-wrapper">
            <input
              type="checkbox"
              className="consent-checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span className="consent-label">I consent to the processing of my data</span>
          </label>

          {error && <p className="error-text">{error}</p>}

          {/* Submit */}
          <button
            className="upload-btn"
            onClick={handleSubmit}
            disabled={loading || !name.trim() || !consent}
          >
            {loading ? <div className="spinner" /> : "UPLOAD YOURSELF ➔"}
          </button>
        </div>
      </div>
    </div>
  );
}
