<script>
    import Login from "./routes/Login.svelte";
    import Register from "./routes/Register.svelte";
    import Board from "./routes/Board.svelte";
    import Toast from "./components/Toast.svelte";
    import Choice from "./routes/Choice.svelte";
    import { Router,Route} from "svelte-routing";

    export let url = "";
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
