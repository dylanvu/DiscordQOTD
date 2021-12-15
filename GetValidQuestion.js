import Axios from 'axios';

function PickQuestion(post, prevQset, filter, postLimit) {

    // This function takes in a post of question results,
    // a filter of forbidden words,
    // and an integer of a post limit
    
    // And returns a question and whether it is not valid, considering the Reddit adult API tag and previous questions
    
    let notValid = true;
    let question = "";
    let i = 0;
    while (notValid) {
        question = post.data.data.children[i].data.title;
        if (post.data.data.children[i].data.whitelist_status == "promo_adult_nsfw") {
            notValid = true;
        } else if (prevQset.has(question)) {
            notValid = true;
        } else {
            notValid = filter.isProfane(question);
        }
        i++;
        if (i > postLimit - 1) {
            break;
        }
    }
    return {question : question, notValid : notValid};
};

export async function GetValidQuestion(prevQset, filter) {
    const TOP_POST_API = "https://www.reddit.com/r/askreddit/top.json";
    // TODO: Error catching
    let post = await Axios.get(TOP_POST_API);
    // See if the top 25 posts are profane free, and get the first one
    let questionObj = PickQuestion(post, prevQset, filter, 25);
    // If, for some reason, the top 25 results ALL have profanity, try the top 100 posts
    if (questionObj.notValid) {
        post = await Axios.get(TOP_POST_API + "?limit=100");
        questionObj = PickQuestion(post, prevQset, filter, 100);
    }
    // If the top 100 posts ALL have profanity, throw a general error
    if (questionObj.notValid) {
        questionObj.question = "404 Question not found. Please make your own QOTD this time, sorry!";
    }
    // TODO: Randomize between non-profane questions? So people who commonly use Reddit will see a relatively new question?
    return questionObj.question;
}