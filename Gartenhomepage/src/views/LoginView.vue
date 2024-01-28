<script>
import axios from 'axios';
import router from "@/router/index.ts"

export default {
  data() {
    return {
      username: '',
      password: '',
      loginResponse: null
    };
  },
  methods: {
    async login() {
      try {
        const response = await axios.post('http://localhost:3000', {
          username: this.username,
          password: this.password
        });
        if (response.data.success){
          // Nach erfolgreichem Login leiten Sie auf die Mitgliederseite um
          await router.push("/member")
        }
      } catch (error) {
        console.error('Fehler beim Anmelden:', error);
      }
    }
  },
}
</script>

<template>
  <div class="login-container">
    <h1>Login</h1>
    <form @submit.prevent="login">
      <input type="text" v-model="username" placeholder="Benutzername">
      <input type="password" v-model="password" placeholder="Passwort">
      <button type="submit" class="nlink">Anmelden</button>
    </form>

    <!-- Anzeige der Serverantwort -->
    <div v-if="loginResponse !== null">
      <p v-if="loginResponse.success">{{ loginResponse.message }}</p>
      <p v-else>{{ loginResponse.message }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-container{
  width: fit-content;
  background-color: #333333;
  padding: 5rem;
  border-radius: 10%;
  border: 10px solid #8dbf67;
  justify-self: center;
  align-self: center;
  display: grid;
  justify-items: center;
  font-family: Roobert,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol";
  color: floralwhite;
  font-size: large;
}

.login-container form {
  display: grid;
  justify-items: center;
  align-content: center;
}

form input {
  font-family: inherit;
  width: 100%;
  border: 0;
  border-bottom: 2px solid gray;
  outline: 0;
  font-size: 1.3rem;
  color: white;
  padding: 7px 0;
  background: rgba(255,250,241,0.15);
  transition: border-color 0.2s;
}
&::placeholder {
  color: transparent;
}
</style>
