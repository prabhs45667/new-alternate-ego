"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startOnboarding, uploadDataExport } from "@/lib/api";

export default function UploadPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [facebook, setFacebook] = useState("");
  const [otherUrls, setOtherUrls] = useState<string[]>([""]);
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
      setDataFiles(prev => [...prev, ...Array.from(e.target.files!)]);
      // Reset input so same file can be selected again if needed
      e.target.value = '';
    }
  };

  const handleAddOtherUrl = () => {
    setOtherUrls(prev => [...prev, ""]);
  };

  const handleOtherUrlChange = (index: number, value: string) => {
    const newUrls = [...otherUrls];
    newUrls[index] = value;
    setOtherUrls(newUrls);
  };

  const handleRemoveOtherUrl = (index: number) => {
    if (otherUrls.length > 1) {
      setOtherUrls(prev => prev.filter((_, i) => i !== index));
    } else {
      setOtherUrls([""]);
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
        other_url: otherUrls.map(u => u.trim()).filter(Boolean).join(','),
        email: email.trim(),
        phone: phone.trim(),
      });

      // Upload all selected ZIP files to the backend
      if (dataFiles.length > 0) {
        setLoading(true);
        for (const file of dataFiles) {
          try {
            await uploadDataExport(result.twin_id, result.session_id, file);
          } catch (e) {
            console.warn(`Failed to upload ${file.name}`, e);
          }
        }
      }

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
          other_url: otherUrls.map(u => u.trim()).filter(Boolean).join(','),
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
            {otherUrls.map((url, index) => (
              <div key={`other-url-${index}`} className="social-input-row" style={{gridColumn: '1 / -1', display: 'flex', gap: '8px'}}>
                <span className="social-icon">🔗</span>
                <input
                  className="input-glass flex-grow"
                  placeholder="Any other URL (Portfolio, TikTok, Blog, GitHub...)"
                  value={url}
                  onChange={(e) => handleOtherUrlChange(index, e.target.value)}
                />
                {index === otherUrls.length - 1 ? (
                  <button 
                    onClick={handleAddOtherUrl}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-600/50 text-white hover:bg-purple-600/80 transition-colors"
                    title="Add another URL"
                  >
                    +
                  </button>
                ) : (
                  <button 
                    onClick={() => handleRemoveOtherUrl(index)}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/30 text-white hover:bg-red-500/60 transition-colors"
                    title="Remove URL"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
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
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-center cursor-pointer w-full py-3 px-4 border-2 border-dashed border-purple-500/30 rounded-xl bg-purple-900/10 hover:bg-purple-900/20 transition-colors text-white/80 font-medium text-sm">
                <span>+ Click to add ZIP files</span>
                <input
                  type="file"
                  accept=".zip"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                />
              </label>
            </div>
            {dataFiles.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {dataFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 px-4 py-2.5 rounded-lg hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-purple-400 text-lg">📦</span>
                      <span className="truncate text-white/90 text-sm font-medium">{f.name}</span>
                    </div>
                    <button 
                      onClick={() => handleRemoveFile(i)} 
                      className="text-red-400/70 hover:text-red-400 hover:bg-red-400/10 w-8 h-8 flex items-center justify-center rounded-full transition-all flex-shrink-0"
                      title="Remove file"
                    >
                      ✕
                    </button>
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
