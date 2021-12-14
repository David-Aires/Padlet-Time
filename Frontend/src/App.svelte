<script>
    import Login from "./routes/Login.svelte";
    import Register from "./routes/Register.svelte";
    import Board from "./routes/Board.svelte";
    import Toast from "./components/Toast.svelte";
    import Choice from "./routes/Choice.svelte";
    import room from "./stores/Room.js"
    import { Router,Route, navigate} from "svelte-routing";

    export let url = "";

    let id = parseInt(location.href.split("/").pop());
    $: !Number.isNaN(id) && room.join(id);
    $: $room && $room.id
        ? navigate($room.id, { replace: true })
        : navigate(location.href.split("/").pop(), { replace: true });
</script>


<Toast/>
<Router url="{url}">
    <div>
        <Route path="/"><Login /></Route>
        <Route path="register"><Register /></Route>
        <Route path="choice"><Choice/></Route>
        <Route><Board /></Route>
    </div>
  </Router>
