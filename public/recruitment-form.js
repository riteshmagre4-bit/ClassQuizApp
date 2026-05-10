(function () {
  const formIdInput = document.getElementById("formId");
  const nameEntryInput = document.getElementById("nameEntry");
  const emailEntryInput = document.getElementById("emailEntry");
  const roleEntryInput = document.getElementById("roleEntry");

  const candidateNameInput = document.getElementById("candidateName");
  const candidateEmailInput = document.getElementById("candidateEmail");
  const candidateRoleInput = document.getElementById("candidateRole");

  const generateLinkBtn = document.getElementById("generateLinkBtn");
  const openFormBtn = document.getElementById("openFormBtn");
  const generatedLinkInput = document.getElementById("generatedLink");
  const formStatus = document.getElementById("formStatus");

  function normalizeEntry(entryId) {
    if (!entryId) return "";
    return entryId.startsWith("entry.") ? entryId : `entry.${entryId}`;
  }

  function setStatus(message, isError) {
    formStatus.textContent = message;
    formStatus.className = isError ? "error" : "success";
  }

  function buildPrefilledLink() {
    const formId = formIdInput.value.trim();
    const nameEntry = normalizeEntry(nameEntryInput.value.trim());
    const emailEntry = normalizeEntry(emailEntryInput.value.trim());
    const roleEntry = normalizeEntry(roleEntryInput.value.trim());

    const candidateName = candidateNameInput.value.trim();
    const candidateEmail = candidateEmailInput.value.trim();
    const candidateRole = candidateRoleInput.value.trim();

    if (!formId || !nameEntry || !emailEntry || !roleEntry) {
      setStatus("Please provide form id and all required entry ids.", true);
      return "";
    }

    const baseUrl = `https://docs.google.com/forms/d/e/${encodeURIComponent(formId)}/viewform`;
    const params = new URLSearchParams();

    if (candidateName) params.set(nameEntry, candidateName);
    if (candidateEmail) params.set(emailEntry, candidateEmail);
    if (candidateRole) params.set(roleEntry, candidateRole);

    params.set("usp", "pp_url");

    return `${baseUrl}?${params.toString()}`;
  }

  generateLinkBtn.addEventListener("click", function () {
    const link = buildPrefilledLink();
    if (!link) return;

    generatedLinkInput.value = link;
    setStatus("Prefilled Google Form link generated.", false);
  });

  openFormBtn.addEventListener("click", function () {
    const link = generatedLinkInput.value.trim() || buildPrefilledLink();
    if (!link) {
      setStatus("Generate a link first.", true);
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
  });
})();
