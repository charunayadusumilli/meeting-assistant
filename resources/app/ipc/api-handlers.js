function registerApiHandlers({ ipcMain, apiService }) {
  ipcMain.handle('api-fetch-topics', async (event, search, page, pageSize) => {
    try {
      const data = await apiService.fetchTopics(search, page, pageSize);
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching topics:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('api-fetch-topic-details', async (event, topicId) => {
    try {
      const data = await apiService.fetchTopicDetails(topicId);
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching topic details:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerApiHandlers
};

