<script>
    import Login from "./routes/Login.svelte";
    import Register from "./routes/Register.svelte";
    import Board from "./routes/Board.svelte";
    import Toast from "./components/Toast.svelte";
    import Choice from "./routes/Choice.svelte";
    import room from "./stores/Room.js";
    import { userStore }  from "./stores/Auth.js";
    import { Router,Route, navigate} from "svelte-routing";
    import Modal from 'svelte-simple-modal';

    export let url = "";

    let id = location.href.split("/").pop();
    $: (id != "choice" && id != "register" && id != "login" && id != "" && $userStore.token != '')? room.join(id): '';
    $: $room && $room.id
        ? navigate($room.id, { replace: true })
        : ($userStore.token != '') ?  navigate("choice", { replace: true }) : (id=="register")?navigate("register", { replace: true }):navigate("/", { replace: true });
</script>


<Toast/>
<Modal>
<Router url="{url}">
    <div>
        <Route path="/"><Login /></Route>
        <Route path="register"><Register /></Route>
        <Route path="choice"><Choice/></Route>
        <Route><Board /></Route>
    </div>
  </Router>
</Modal>
