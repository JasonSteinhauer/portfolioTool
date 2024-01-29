<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';

axios.defaults.baseURL = 'http://localhost:3000'

const userData = ref(null);

const fetchUserData = async () => {
  try {
    const response = await axios.get('/userdata');
    userData.value = response.data;
  } catch (error) {
    console.error('Fehler beim Abrufen von Benutzerdaten:', error);
  }
};

onMounted(() => {
  fetchUserData();
});
</script>

<template>
  <div>
    <h1>Mitglieder</h1>
    <div v-if="userData">
      <p>Benutzername: {{ userData.username }}</p>
      <p>ID: {{ userData.ID }}</p>
      <p>Rolle: {{ userData.role }}</p>
    </div>
  </div>
</template>

<style scoped>
</style>
