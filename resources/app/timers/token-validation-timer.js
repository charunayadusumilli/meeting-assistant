let tokenValidationTimer = null;
let isValidatingToken = false;

async function validateAuthToken({ authService }) {
  if (isValidatingToken) {
    return;
  }

  if (!authService.isAuthenticated()) {
    return;
  }

  try {
    isValidatingToken = true;
    const isAuth = await authService.isAuthenticatedAsync();

    if (!isAuth) {
      console.log('Token validation failed - user will be logged out');
    }
  } catch (error) {
    console.error('Error during token validation:', error);
  } finally {
    isValidatingToken = false;
  }
}

function startTokenValidationTimer({ authService }) {
  if (tokenValidationTimer) {
    clearInterval(tokenValidationTimer);
  }

  tokenValidationTimer = setInterval(() => {
    validateAuthToken({ authService });
  }, 60000);

  console.log('Token validation timer started (60s interval)');
}

function stopTokenValidationTimer() {
  if (tokenValidationTimer) {
    clearInterval(tokenValidationTimer);
    tokenValidationTimer = null;
    console.log('Token validation timer stopped');
  }
}

module.exports = {
  startTokenValidationTimer,
  stopTokenValidationTimer,
  validateAuthToken
};

