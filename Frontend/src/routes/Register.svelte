<script>
    import Particles from "svelte-particles";
    import {particlesConfig} from "../effects/particles.svelte";
    import room from "../stores/Room.js";

    let valueUsername = undefined;
    let valuePassword = undefined;
    let valueConfirmPassword = undefined;
    let failure = false;

    const check = () => {
        if(valuePassword == valueConfirmPassword) {
            room.register(valueUsername,valuePassword)
        } else {
            valueConfirmPassword = "";
            valuePassword = "";
            valueUsername = "";
            failure = true;
        }
    }

</script>

<style>
    * {
        box-sizing: border-box;
    }

    body {
        font-family: sans-serif;
        height: 100vh;
        margin: 0;
        padding: 0;
    }

    header {
        display: none;
    }

    .box {
        background-color: rgba(0, 0, 0, 0.8);
        border-radius: 10px;
        box-shadow: 0 15px 25px rgba(0, 0, 0, 0.8);
        margin: auto auto;
        padding: 40px;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .box h2 {
        margin: 0 0 30px 0;
        padding: 0;
        color: #fff;
        text-align: center;
    }

    .box .inputBox label {
        color: #fff;
    }

    .box .inputBox input {
        background: transparent;
        border: none;
        border-bottom: 1px solid #fff;
        color: #fff;
        font-size: 18px;
        letter-spacing: 2px;
        margin-bottom: 30px;
        outline: none;
        padding: 10px 0;
        width: 100%;
    }

    .box input[type="submit"], .box button[type="submit"], a.button {
        font-family: sans-serif;
        background: #03a9f4;
        font-size: 11px;
        border: none;
        border-radius: 5px;
        color: #fff;
        cursor: pointer;
        font-weight: 600;
        padding: 10px 20px;
        letter-spacing: 2px;
        outline: none;
        text-transform: uppercase;
        text-decoration: none;
        margin: 2px 10px 2px 0;
        display: inline-block;
    }

    .box input[type="submit"]:hover, .box button[type="submit"]:hover, a.button:hover {
        opacity: 0.8;
    }

    .failure {
        color: red;
    }
</style>

<Particles id="tsparticles" options="{particlesConfig}"/>
<main class="box">
    <h2>Register</h2>
        <div class="inputBox">
            <label for="userName">Username</label>
            <input type="text" name="userName" id="userName" placeholder="type your username" bind:value={valueUsername} required/>
        </div>
        <div class="inputBox">
            <label for="userPassword">Password</label>
            <input type="password" name="userPassword" id="userPassword" placeholder="type your password"
                   bind:value={valuePassword}
                   required/>
        </div>
        <div class="inputBox">
            <label for="userConfirmPassword">Confirm Password</label>
            <input type="password" name="userPassword" id="userConfirmPassword" placeholder="confirm your password"
                   bind:value={valueConfirmPassword}
                   required/>
        </div>
        <button type="submit" name="" style="float: left;" on:click={check}>Submit</button>
        {#if failure}
            <p class="failure">Les mots de passes ne correspondent pas!</p>
        {/if}
        <a class="button" href="/" style="float: left;">Login</a>
</main>
<footer>
</footer>
