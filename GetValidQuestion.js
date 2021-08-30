
export default function GetValidQuestion(post, prevQset, filter, postLimit) {

    // This function takes in a post of question results,
    // a filter of forbidden words,
    // and an integer of a post limit
    
    // And returns a question and whether it is not valid, considering the Reddit adult API tag and previous questions
    
    let notValid = true;
    let question;
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