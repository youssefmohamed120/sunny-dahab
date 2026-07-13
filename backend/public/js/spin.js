const canvas = document.getElementById("wheel");

const ctx = canvas.getContext("2d");

const prizes = [

"Coffee Mug",

"Cap",

"T-Shirt",

"Notebook",

"Sticker",

"Discount",

"Keychain",

"Gift"

];

const colors=[

"#FFD166",

"#06D6A0",

"#118AB2",

"#EF476F",

"#F78C6B",

"#83C5BE",

"#FFBE0B",

"#90BE6D"

];

const size=500;

const center=size/2;

const radius=230;

const angle=(2*Math.PI)/prizes.length;

for(let i=0;i<prizes.length;i++){

ctx.beginPath();

ctx.moveTo(center,center);

ctx.arc(

center,

center,

radius,

i*angle,

(i+1)*angle

);

ctx.fillStyle=colors[i];

ctx.fill();

ctx.save();

ctx.translate(center,center);

ctx.rotate(i*angle+angle/2);

ctx.fillStyle="#fff";

ctx.font="18px Arial";

ctx.textAlign="right";

ctx.fillText(prizes[i],190,10);

ctx.restore();

}