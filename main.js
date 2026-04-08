const form = document.querySelector("#contact-form");
const statusNode = document.querySelector("#form-status");
const submitButton = form?.querySelector('button[type="submit"]');
const startedAtField = document.querySelector("#form-started-at");

if (startedAtField) {
  startedAtField.value = String(Date.now());
}

const validateForm = (formData) => {
  const errors = [];
  const name = formData.get("name")?.trim() ?? "";
  const email = formData.get("email")?.trim() ?? "";
  const message = formData.get("message")?.trim() ?? "";

  if (!name) errors.push("Enter your name.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Enter a valid email address.");
  }
  if (!message) errors.push("Enter a short description of the project.");

  return errors;
};

const setStatus = (message, type) => {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.classList.remove("error", "success");
  if (type) {
    statusNode.classList.add(type);
  }
};

if (form && submitButton) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const errors = validateForm(formData);

    if (errors.length > 0) {
      setStatus(errors[0], "error");
      return;
    }

    submitButton.disabled = true;
    setStatus("Sending inquiry...", null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus(payload.message || "Unable to send your inquiry right now.", "error");
        return;
      }

      form.reset();
      if (startedAtField) {
        startedAtField.value = String(Date.now());
      }
      setStatus("Inquiry sent. We will review it and follow up if it is a fit.", "success");
    } catch {
      setStatus("Unable to send your inquiry right now.", "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}
