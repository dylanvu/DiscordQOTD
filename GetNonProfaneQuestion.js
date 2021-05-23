
export default function GetNonProfaneQuestion(post, prevQset, filter, postLimit) {

    // This function takes in a post of question results,
    // a filter of forbidden words,
    // and an integer of a post limit
    
    // And returns a question and whether it is profane, considering the Reddit adult API tag
    
    let profanity = true;
    let question;
    let i = 0;
    while (profanity) {
        question = post.data.data.children[i].data.title;
        if (post.data.data.children[i].data.whitelist_status == "promo_adult_nsfw") {
            profanity = true;
        } else if (prevQset.has(question)) {
            profanity = true;
        } else {
            profanity = filter.isProfane(question);
        }
        i++;
        if (i > postLimit - 1) {
            break;
        }
    }
    return {question : question, profanity : profanity};
};