const phone=document.getElementById("phone");

const btn=document.getElementById("spinBtn");

btn.onclick=async()=>{

    if(phone.value==""){

        alert("Enter phone");

        return;

    }

    const check=await fetch("/api/spin/check",{

        method:"POST",

        headers:{
            "Content-Type":"application/json"
        },

        body:JSON.stringify({

            phone:phone.value

        })

    });

    const data=await check.json();

    if(!data.canSpin){

        alert("You already played");

        return;

    }

    const play=await fetch("/api/spin/play",{

        method:"POST",

        headers:{
            "Content-Type":"application/json"
        },

        body:JSON.stringify({

            phone:phone.value

        })

    });

    const prize=await play.json();

    console.log(prize);

}